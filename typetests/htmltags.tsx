/**
 * `htmlTags` covers the content-only tags and nothing else. A message reaching
 * for anything outside that set has to say so at the call site, which is what
 * keeps an `href` from ever being read out of translated copy.
 */
import { createReactBindings, htmlTags } from "../src/react.js";
import { createTolka } from "../src/runtime.js";

const tolka = createTolka({
    locales: ["sv"],
    defaultLocale: "sv",
    plugins: [],
});
const { useDictionary } = createReactBindings(tolka);

const dictionary = tolka.createDictionary({
    content: {
        terms: { sv: "<p><strong>Rubrik</strong></p><ul><li>Ett</li></ul>" },
        withLink: { sv: "Läs <a>villkoren</a> först." },
        withCount: { sv: "<p>{count} kvar</p>" },
    },
});

export function Covered() {
    const { content } = useDictionary(dictionary);
    return content.terms(htmlTags);
}

export function LinkNeedsItsOwnRenderer() {
    const { content } = useDictionary(dictionary);
    // @ts-expect-error `a` is deliberately not in htmlTags: its href comes from code
    void content.withLink(htmlTags);
    // supplying it explicitly is how a link is written
    return content.withLink({ ...htmlTags, a: (chunks) => chunks });
}

export function PlaceholdersStillRequired() {
    const { content } = useDictionary(dictionary);
    // @ts-expect-error the message's own argument is still missing
    void content.withCount(htmlTags);
    return content.withCount({ ...htmlTags, count: 3 });
}
