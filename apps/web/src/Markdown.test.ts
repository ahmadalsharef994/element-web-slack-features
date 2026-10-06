/*
Copyright 2024 New Vector Ltd.
Copyright 2021 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { describe, it, expect } from "vitest";

import Markdown from "./Markdown";

describe("Markdown parser test", () => {
    describe("fixing HTML links", () => {
        const testString = [
            "Test1:",
            "#_foonetic_xkcd:matrix.org",
            "http://google.com/_thing_",
            "https://matrix.org/_matrix/client/foo/123_",
            "#_foonetic_xkcd:matrix.org",
            "",
            "Test1A:",
            "#_foonetic_xkcd:matrix.org",
            "http://google.com/_thing_",
            "https://matrix.org/_matrix/client/foo/123_",
            "#_foonetic_xkcd:matrix.org",
            "",
            "Test2:",
            "http://domain.xyz/foo/bar-_stuff-like-this_-in-it.jpg",
            "http://domain.xyz/foo/bar-_stuff-like-this_-in-it.jpg",
            "",
            "Test3:",
            "https://riot.im/app/#/room/#_foonetic_xkcd:matrix.org",
            "https://riot.im/app/#/room/#_foonetic_xkcd:matrix.org",
        ].join("\n");

        it("tests that links with markdown empasis in them are getting properly HTML formatted", () => {
            const expectedResult = [
                "<p>Test1:<br />#_foonetic_xkcd:matrix.org<br />http://google.com/_thing_<br />https://matrix.org/_matrix/client/foo/123_<br />#_foonetic_xkcd:matrix.org</p>",
                "<p>Test1A:<br />#_foonetic_xkcd:matrix.org<br />http://google.com/_thing_<br />https://matrix.org/_matrix/client/foo/123_<br />#_foonetic_xkcd:matrix.org</p>",
                "<p>Test2:<br />http://domain.xyz/foo/bar-_stuff-like-this_-in-it.jpg<br />http://domain.xyz/foo/bar-_stuff-like-this_-in-it.jpg</p>",
                "<p>Test3:<br />https://riot.im/app/#/room/#_foonetic_xkcd:matrix.org<br />https://riot.im/app/#/room/#_foonetic_xkcd:matrix.org</p>",
                "",
            ].join("\n");
            const md = new Markdown(testString);
            expect(md.toHTML()).toEqual(expectedResult);
        });
        it("tests that links with autolinks are not touched at all and are still properly formatted", () => {
            const test = [
                "Test1:",
                "<#_foonetic_xkcd:matrix.org>",
                "<http://google.com/_thing_>",
                "<https://matrix.org/_matrix/client/foo/123_>",
                "<#_foonetic_xkcd:matrix.org>",
                "",
                "Test1A:",
                "<#_foonetic_xkcd:matrix.org>",
                "<http://google.com/_thing_>",
                "<https://matrix.org/_matrix/client/foo/123_>",
                "<#_foonetic_xkcd:matrix.org>",
                "",
                "Test2:",
                "<http://domain.xyz/foo/bar-_stuff-like-this_-in-it.jpg>",
                "<http://domain.xyz/foo/bar-_stuff-like-this_-in-it.jpg>",
                "",
                "Test3:",
                "<https://riot.im/app/#/room/#_foonetic_xkcd:matrix.org>",
                "<https://riot.im/app/#/room/#_foonetic_xkcd:matrix.org>",
            ].join("\n");
            /**
             * NOTE: I'm not entirely sure if those "<"" and ">" should be visible in here for #_foonetic_xkcd:matrix.org
             * but it seems to be actually working properly
             */
            const expectedResult = [
                '<p>Test1:<br />&lt;#_foonetic_xkcd:matrix.org&gt;<br /><a href="http://google.com/_thing_">http://google.com/_thing_</a><br /><a href="https://matrix.org/_matrix/client/foo/123_">https://matrix.org/_matrix/client/foo/123_</a><br />&lt;#_foonetic_xkcd:matrix.org&gt;</p>',
                '<p>Test1A:<br />&lt;#_foonetic_xkcd:matrix.org&gt;<br /><a href="http://google.com/_thing_">http://google.com/_thing_</a><br /><a href="https://matrix.org/_matrix/client/foo/123_">https://matrix.org/_matrix/client/foo/123_</a><br />&lt;#_foonetic_xkcd:matrix.org&gt;</p>',
                '<p>Test2:<br /><a href="http://domain.xyz/foo/bar-_stuff-like-this_-in-it.jpg">http://domain.xyz/foo/bar-_stuff-like-this_-in-it.jpg</a><br /><a href="http://domain.xyz/foo/bar-_stuff-like-this_-in-it.jpg">http://domain.xyz/foo/bar-_stuff-like-this_-in-it.jpg</a></p>',
                '<p>Test3:<br /><a href="https://riot.im/app/#/room/#_foonetic_xkcd:matrix.org">https://riot.im/app/#/room/#_foonetic_xkcd:matrix.org</a><br /><a href="https://riot.im/app/#/room/#_foonetic_xkcd:matrix.org">https://riot.im/app/#/room/#_foonetic_xkcd:matrix.org</a></p>',
                "",
            ].join("\n");
            const md = new Markdown(test);
            expect(md.toHTML()).toEqual(expectedResult);
        });

        it("expects that links in codeblock are not modified", () => {
            const expectedResult = [
                '<pre><code class="language-Test1:">#_foonetic_xkcd:matrix.org',
                "http://google.com/_thing_",
                "https://matrix.org/_matrix/client/foo/123_",
                "#_foonetic_xkcd:matrix.org",
                "",
                "Test1A:",
                "#_foonetic_xkcd:matrix.org",
                "http://google.com/_thing_",
                "https://matrix.org/_matrix/client/foo/123_",
                "#_foonetic_xkcd:matrix.org",
                "",
                "Test2:",
                "http://domain.xyz/foo/bar-_stuff-like-this_-in-it.jpg",
                "http://domain.xyz/foo/bar-_stuff-like-this_-in-it.jpg",
                "",
                "Test3:",
                "https://riot.im/app/#/room/#_foonetic_xkcd:matrix.org",
                "https://riot.im/app/#/room/#_foonetic_xkcd:matrix.org```",
                "</code></pre>",
                "",
            ].join("\n");
            const md = new Markdown("```" + testString + "```");
            expect(md.toHTML()).toEqual(expectedResult);
        });

        it('expects that links with emphasis are "escaped" correctly', () => {
            const testString = [
                "http://domain.xyz/foo/bar-_stuff-like-this_-in-it.jpg" +
                    " " +
                    "http://domain.xyz/foo/bar-_stuff-like-this_-in-it.jpg",
                "http://domain.xyz/foo/bar-_stuff-like-this_-in-it.jpg" +
                    " " +
                    "http://domain.xyz/foo/bar-_stuff-like-this_-in-it.jpg",
                "https://example.com/_test_test2_-test3",
                "https://example.com/_test_test2_test3_",
                "https://example.com/_test__test2_test3_",
                "https://example.com/_test__test2__test3_",
                "https://example.com/_test__test2_test3__",
                "https://example.com/_test__test2",
            ].join("\n");
            const expectedResult = [
                "http://domain.xyz/foo/bar-_stuff-like-this_-in-it.jpg http://domain.xyz/foo/bar-_stuff-like-this_-in-it.jpg",
                "http://domain.xyz/foo/bar-_stuff-like-this_-in-it.jpg http://domain.xyz/foo/bar-_stuff-like-this_-in-it.jpg",
                "https://example.com/_test_test2_-test3",
                "https://example.com/_test_test2_test3_",
                "https://example.com/_test__test2_test3_",
                "https://example.com/_test__test2__test3_",
                "https://example.com/_test__test2_test3__",
                "https://example.com/_test__test2",
            ].join("<br />");
            const md = new Markdown(testString);
            expect(md.toHTML()).toEqual(expectedResult);
        });

        it("expects that the link part will not be accidentally added to <strong>", () => {
            const testString = `https://github.com/matrix-org/synapse/blob/develop/synapse/module_api/__init__.py`;
            const expectedResult = "https://github.com/matrix-org/synapse/blob/develop/synapse/module_api/__init__.py";
            const md = new Markdown(testString);
            expect(md.toHTML()).toEqual(expectedResult);
        });

        it("expects that the link part will not be accidentally added to <strong> for multiline links", () => {
            const testString = [
                "https://github.com/matrix-org/synapse/blob/develop/synapse/module_api/__init__.py" +
                    " " +
                    "https://github.com/matrix-org/synapse/blob/develop/synapse/module_api/__init__.py",
                "https://github.com/matrix-org/synapse/blob/develop/synapse/module_api/__init__.py" +
                    " " +
                    "https://github.com/matrix-org/synapse/blob/develop/synapse/module_api/__init__.py",
            ].join("\n");
            const expectedResult = [
                "https://github.com/matrix-org/synapse/blob/develop/synapse/module_api/__init__.py" +
                    " " +
                    "https://github.com/matrix-org/synapse/blob/develop/synapse/module_api/__init__.py",
                "https://github.com/matrix-org/synapse/blob/develop/synapse/module_api/__init__.py" +
                    " " +
                    "https://github.com/matrix-org/synapse/blob/develop/synapse/module_api/__init__.py",
            ].join("<br />");
            const md = new Markdown(testString);
            expect(md.toHTML()).toEqual(expectedResult);
        });

        it("resumes applying formatting to the rest of a message after a link", () => {
            const testString = "http://google.com/_thing_ *does* __not__ exist";
            const expectedResult = "http://google.com/_thing_ <em>does</em> <strong>not</strong> exist";
            const md = new Markdown(testString);
            expect(md.toHTML()).toEqual(expectedResult);
        });
    });
});

describe("Markdown strikethrough", () => {
    it.each([
        ["~~gone~~", "<del>gone</del>"],
        ["a ~~b~~ c ~~d~~", "a <del>b</del> c <del>d</del>"],
        ["~~**bold**~~", "<del><strong>bold</strong></del>"],
        ["~~unclosed", "~~unclosed"],
        ["~~a~~ ~~b", "<del>a</del> ~~b"],
        ["`~~code~~`", "<code>~~code~~</code>"],
    ])("renders %s", (input, html) => {
        expect(new Markdown(input).toHTML()).toEqual(html);
    });

    it("is not plain text", () => {
        expect(new Markdown("~~gone~~").isPlainText()).toBe(false);
        expect(new Markdown("~~unclosed").isPlainText()).toBe(true);
    });
});

describe("Markdown soft breaks", () => {
    const wrapped = "First line\nsecond line\n\nNext paragraph";

    it("turns soft breaks into line breaks by default, as messages want", () => {
        expect(new Markdown(wrapped).toHTML()).toEqual("<p>First line<br />second line</p>\n<p>Next paragraph</p>\n");
    });

    it("keeps soft breaks as newlines when asked, as a wrapped document wants", () => {
        expect(new Markdown(wrapped).toHTML({ hardSoftBreaks: false })).toEqual(
            "<p>First line\nsecond line</p>\n<p>Next paragraph</p>\n",
        );
    });
});

describe("Markdown tables", () => {
    const html = (input: string, options?: Parameters<Markdown["toHTML"]>[0]): string =>
        new Markdown(input).toHTML(options);

    it("renders a table", () => {
        const md = new Markdown("| a | b |\n|---|---|\n| 1 | 2 |");

        expect(md.toHTML()).toBe(
            "<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>",
        );
        expect(md.isPlainText()).toBe(false);
    });

    it("renders a table without body rows", () => {
        expect(html("| a |\n|---|")).toBe("<table><thead><tr><th>a</th></tr></thead></table>");
    });

    it("reads column alignment from the delimiter row", () => {
        expect(html("| a | b | c | d |\n|:--|:-:|--:|---|\n| 1 | 2 | 3 | 4 |")).toBe(
            '<table><thead><tr><th align="left">a</th><th align="center">b</th><th align="right">c</th><th>d</th></tr>' +
                '</thead><tbody><tr><td align="left">1</td><td align="center">2</td><td align="right">3</td><td>4</td>' +
                "</tr></tbody></table>",
        );
    });

    it("renders inline Markdown in cells", () => {
        expect(html("| **b** | _i_ | `c` | [l](http://x/) | ~~s~~ | ~~**d**~~ |\n|-|-|-|-|-|-|")).toBe(
            "<table><thead><tr><th><strong>b</strong></th><th><em>i</em></th><th><code>c</code></th>" +
                '<th><a href="http://x/">l</a></th><th><del>s</del></th><th><del><strong>d</strong></del></th></tr>' +
                "</thead></table>",
        );
    });

    it("keeps an escaped pipe inside its cell", () => {
        expect(html("| a \\| b | `c\\|d` |\n|---|---|\n| 1 | 2 |")).toBe(
            "<table><thead><tr><th>a | b</th><th><code>c|d</code></th></tr></thead>" +
                "<tbody><tr><td>1</td><td>2</td></tr></tbody></table>",
        );
    });

    it("does not need outer pipes", () => {
        expect(html("a | b\n--|--\n1 | 2")).toBe(
            "<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>",
        );
    });

    it("truncates long rows to the header width and does not pad short ones", () => {
        expect(html("| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |")).toBe(
            "<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td></tr>" +
                "<tr><td>1</td><td>2</td></tr></tbody></table>",
        );
    });

    it("keeps the output size proportional to the input for a wide table with empty rows", () => {
        const columns = 1000;
        const input = `|${"a|".repeat(columns)}\n|${"-|".repeat(columns)}\n${"|\n".repeat(1000)}`;

        expect(html(input).length).toBeLessThan(input.length * 10);
    });

    it("keeps the text around a table", () => {
        expect(html("Here:\n| a |\n|---|\n| 1 |\n\nAfter")).toBe(
            "<p>Here:</p>\n<table><thead><tr><th>a</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>" +
                "\n<p>After</p>\n",
        );
    });

    it("applies the other repairs to the text before a table", () => {
        expect(html("~~gone~~\n| a |\n|---|")).toBe(
            "<p><del>gone</del></p>\n<table><thead><tr><th>a</th></tr></thead></table>",
        );
    });

    it("renders two tables in one message", () => {
        expect(html("| a |\n|---|\n\n| b |\n|---|").match(/<table>/g)).toHaveLength(2);
    });

    it("handles CRLF line endings", () => {
        expect(html("| a |\r\n|---|\r\n| 1 |")).toBe(
            "<table><thead><tr><th>a</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>",
        );
    });

    it.each([
        ["a lone pipe", "|"],
        ["a paragraph containing pipes", "a | b"],
        ["a single piped row", "| a | b |"],
        ["rows without a delimiter row", "| a |\n| b |"],
        ["a header and delimiter of different widths", "| a | b |\n|---|"],
        ["a delimiter row without a pipe", "a | b\n:--"],
        ["a delimiter row without a header", "---|---"],
        ["a header row without a pipe", "a\n|---|"],
    ])("leaves %s as plain text", (_name, input) => {
        const md = new Markdown(input);

        expect(md.isPlainText()).toBe(true);
        expect(md.toHTML()).not.toContain("<table");
    });

    it("leaves a table in a code fence as code", () => {
        expect(html("```\n| a |\n|---|\n```")).toBe("<pre><code>| a |\n|---|\n</code></pre>\n");
    });

    it("leaves a table inside a quote as text", () => {
        expect(html("> | a |\n> |---|")).not.toContain("<table");
    });

    it("keeps block syntax and html in cells as literal text", () => {
        expect(html("| <script>x</script> | # h | - x | 1. | > q |\n|-|-|-|-|-|")).toBe(
            "<table><thead><tr><th>&lt;script&gt;x&lt;/script&gt;</th><th># h</th><th>- x</th><th>1.</th>" +
                "<th>&gt; q</th></tr></thead></table>",
        );
    });

    it("escapes characters that are special in HTML", () => {
        expect(html('| a & b |\n|---|\n| "x" |')).toContain("<th>a &amp; b</th>");
    });

    it("opens links in cells in a new tab when asked", () => {
        expect(html("| [l](http://x/) |\n|---|", { externalLinks: true })).toContain(
            '<a href="http://x/" target="_blank" rel="noreferrer noopener">l</a>',
        );
    });
});
