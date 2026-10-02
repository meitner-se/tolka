import type { ReactNode } from "react";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { Tagged } from "./types.js";

import { createReactBindings } from "./react.js";
import { createTolka, definePlugin } from "./runtime.js";

type Tone = "formal" | "casual";

const tonePlugin = definePlugin({
    tag: "tone",
    resolve: (value: Tagged<"tone">, axis: Tone) =>
        value.states[axis] ?? value.states.default,
});

const tone = tonePlugin.create;

const tolka = createTolka({
    locales: ["sv", "en"] as const,
    defaultLocale: "sv",
    plugins: [tonePlugin] as const,
    onError: () => {},
});

const { DictionaryProvider, useDictionary } = createReactBindings(tolka);

const dictionary = tolka.createDictionary({
    content: {
        title: {
            sv: tone({ default: "Filer", formal: "Dokument" }),
            en: "Files",
        },
        rich: {
            sv: "Du har <b>{n, plural, one {# nytt} other {# nya}}</b> brev",
            en: "You have <b>{n}</b> letters",
        },
        greeting: { sv: "Hej {name}", en: "Hi {name}" },
    },
});

function bold(chunks: ReactNode): ReactNode {
    return <strong>{chunks}</strong>;
}

function render(tree: ReactNode, locale: "sv" | "en", axis: Tone): string {
    return renderToStaticMarkup(
        <DictionaryProvider locale={locale} state={{ tone: axis }}>
            {tree}
        </DictionaryProvider>
    );
}

describe("useDictionary", () => {
    it("resolves through the provider's axes", () => {
        function Title() {
            const { content } = useDictionary(dictionary);
            return <p>{content.title}</p>;
        }
        expect(render(<Title />, "sv", "casual")).toBe("<p>Filer</p>");
        expect(render(<Title />, "sv", "formal")).toBe("<p>Dokument</p>");
        expect(render(<Title />, "en", "formal")).toBe("<p>Files</p>");
    });

    it("renders rich text without React's missing-key warning", () => {
        // The symptom this subpath exists to remove: `format` returns an array
        // as soon as a tag renderer yields an element, and a bare array warns.
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        function Rich() {
            const { content } = useDictionary(dictionary);
            return <p>{content.rich({ n: 3, b: bold })}</p>;
        }
        expect(render(<Rich />, "sv", "casual")).toBe(
            "<p>Du har <strong>3 nya</strong> brev</p>"
        );
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it("passes a tagless formatter's string through untouched", () => {
        function Greeting() {
            const { content } = useDictionary(dictionary);
            return <p>{content.greeting({ name: "Mattis" })}</p>;
        }
        expect(render(<Greeting />, "sv", "casual")).toBe("<p>Hej Mattis</p>");
    });

    it("throws a useful error outside its provider", () => {
        function Orphan() {
            const { content } = useDictionary(dictionary);
            return <p>{content.title}</p>;
        }
        expect(() => renderToStaticMarkup(<Orphan />)).toThrow(
            /outside its DictionaryProvider/
        );
    });
});

describe("referential stability", () => {
    const seen: unknown[] = [];

    function Capture() {
        const resolved = useDictionary(dictionary);
        seen.push(resolved);
        return null;
    }

    it("hands two components the same object", () => {
        seen.length = 0;
        render(
            <>
                <Capture />
                <Capture />
            </>,
            "sv",
            "casual"
        );
        expect(seen).toHaveLength(2);
        expect(seen[0]).toBe(seen[1]);
    });

    it("survives a fresh state object with the same axis values", () => {
        seen.length = 0;
        render(<Capture />, "sv", "casual");
        render(<Capture />, "sv", "casual");
        expect(seen[0]).toBe(seen[1]);
    });

    it("keeps formatter identity stable, so deps arrays are safe", () => {
        seen.length = 0;
        render(<Capture />, "sv", "casual");
        render(<Capture />, "sv", "casual");
        const first = seen[0] as { content: Record<string, unknown> };
        const second = seen[1] as { content: Record<string, unknown> };
        expect(first.content["rich"]).toBe(second.content["rich"]);
    });

    it("gives a different object when an axis changes", () => {
        seen.length = 0;
        render(<Capture />, "sv", "casual");
        render(<Capture />, "sv", "formal");
        render(<Capture />, "en", "casual");
        expect(seen[0]).not.toBe(seen[1]);
        expect(seen[0]).not.toBe(seen[2]);
    });
});

describe("two instances nested", () => {
    // The monorepo shape: a generic instance for shared packages, and a
    // domain-aware one for apps, with both providers in the same tree.
    const generic = createTolka({
        locales: ["sv", "en"] as const,
        defaultLocale: "sv",
        plugins: [] as const,
        onError: () => {},
    });
    const domain = createTolka({
        locales: ["sv", "en"] as const,
        defaultLocale: "sv",
        plugins: [tonePlugin] as const,
        onError: () => {},
    });

    const genericBindings = createReactBindings(generic);
    const domainBindings = createReactBindings(domain);

    const genericDictionary = generic.createDictionary({
        content: { label: { sv: "Generisk", en: "Generic" } },
    });
    const domainDictionary = domain.createDictionary({
        content: { label: { sv: "Domän", en: "Domain" } },
    });

    function Both() {
        const fromGeneric = genericBindings.useDictionary(genericDictionary);
        const fromDomain = domainBindings.useDictionary(domainDictionary);
        return (
            <p>
                {fromGeneric.content.label}/{fromDomain.content.label}
            </p>
        );
    }

    it("each hook reads its own provider, in either nesting order", () => {
        const domainOutside = renderToStaticMarkup(
            <domainBindings.DictionaryProvider
                locale="sv"
                state={{ tone: "casual" }}
            >
                <genericBindings.DictionaryProvider locale="en" state={{}}>
                    <Both />
                </genericBindings.DictionaryProvider>
            </domainBindings.DictionaryProvider>
        );
        // Generic resolves in en, domain in sv. Neither overrode the other.
        expect(domainOutside).toBe("<p>Generic/Domän</p>");

        const genericOutside = renderToStaticMarkup(
            <genericBindings.DictionaryProvider locale="en" state={{}}>
                <domainBindings.DictionaryProvider
                    locale="sv"
                    state={{ tone: "casual" }}
                >
                    <Both />
                </domainBindings.DictionaryProvider>
            </genericBindings.DictionaryProvider>
        );
        expect(genericOutside).toBe(domainOutside);
    });

    it("a missing provider still throws, even with the other one mounted", () => {
        function OnlyDomain() {
            const { content } = domainBindings.useDictionary(domainDictionary);
            return <p>{content.label}</p>;
        }
        expect(() =>
            renderToStaticMarkup(
                <genericBindings.DictionaryProvider locale="sv" state={{}}>
                    <OnlyDomain />
                </genericBindings.DictionaryProvider>
            )
        ).toThrow(/outside its DictionaryProvider/);
    });
});

const nestedTolka = createTolka({
    locales: ["sv"],
    defaultLocale: "sv",
    plugins: [],
});
const nested = createReactBindings(nestedTolka);
const nestedDictionary = nestedTolka.createDictionary({
    content: {
        // `<ul>` receives its `<li>` elements as chunks, which is the only
        // place a renderer's own output lands inside an array.
        alert: {
            sv: "<p><b>Head:</b></p><ul><li>One</li><li>Two</li></ul>",
        },
    },
});

// Hoisted: defined inside the component these read as nested components.
const renderers = {
    p: (chunks: ReactNode) => <p>{chunks}</p>,
    b: (chunks: ReactNode) => <b>{chunks}</b>,
    ul: (chunks: ReactNode) => <ul>{chunks}</ul>,
    li: (chunks: ReactNode) => <li>{chunks}</li>,
};

function Probe() {
    const { content } = nested.useDictionary(nestedDictionary);
    return <>{content.alert(renderers)}</>;
}

function renderNested(): { html: string; keyWarnings: number } {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToStaticMarkup(
        <nested.DictionaryProvider locale="sv" state={{}}>
            <Probe />
        </nested.DictionaryProvider>
    );
    const keyWarnings = spy.mock.calls.filter((args) =>
        String(args[0]).includes('unique "key"')
    ).length;
    spy.mockRestore();
    return { html, keyWarnings };
}

describe("nested tag renderers", () => {
    it("renders the markup", () => {
        expect(renderNested().html).toBe(
            "<p><b>Head:</b></p><ul><li>One</li><li>Two</li></ul>"
        );
    });

    it("warns about no missing keys", () => {
        // The library keys each renderer's output. A call site cannot: wrapping
        // the chunks keys the children, not the element React is validating.
        expect(renderNested().keyWarnings).toBe(0);
    });
});
