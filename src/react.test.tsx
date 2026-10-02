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
