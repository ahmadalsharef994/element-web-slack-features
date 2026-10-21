/*
Copyright 2024 New Vector Ltd.
Copyright 2020 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { describe, it, expect } from "vitest";

import EditorModel from "./model";
import { createPartCreator, createRenderer } from "./__mocks__";
import {
    formatRange,
    formatRangeAsCode,
    formatRangeAsLink,
    selectRangeOfWordAtCaret,
    toggleInlineFormat,
} from "./operations";
import { Formatting } from "../components/views/rooms/MessageComposerFormatBar";
import { longestBacktickSequence } from "./deserialize";
import type DocumentPosition from "./position";

const SERIALIZED_NEWLINE = { text: "\n", type: "newline" };

describe("editor/operations: formatting operations", () => {
    const renderer = createRenderer();
    const pc = createPartCreator();

    describe("formatRange", () => {
        it.each([
            [Formatting.Bold, "hello **world**!"],
            [Formatting.Strikethrough, "hello ~~world~~!"],
        ])("should correctly wrap format %s", (formatting: Formatting, expected: string) => {
            const model = new EditorModel([pc.plain("hello world!")], pc, renderer);

            const range = model.startRange(model.positionForOffset(6, false), model.positionForOffset(11, false)); // around "world"

            expect(range.parts[0].text).toBe("world");
            expect(model.serializeParts()).toEqual([{ text: "hello world!", type: "plain" }]);
            formatRange(range, formatting);
            expect(model.serializeParts()).toEqual([{ text: expected, type: "plain" }]);
        });

        it("should apply to word range is within if length 0", () => {
            const model = new EditorModel([pc.plain("hello world!")], pc, renderer);

            const range = model.startRange(model.positionForOffset(6, false));

            expect(model.serializeParts()).toEqual([{ text: "hello world!", type: "plain" }]);
            formatRange(range, Formatting.Bold);
            expect(model.serializeParts()).toEqual([{ text: "hello **world!**", type: "plain" }]);
        });

        it("should do nothing for a range with length 0 at initialisation", () => {
            const model = new EditorModel([pc.plain("hello world!")], pc, renderer);

            const range = model.startRange(model.positionForOffset(6, false));
            range.setWasEmpty(false);

            expect(model.serializeParts()).toEqual([{ text: "hello world!", type: "plain" }]);
            formatRange(range, Formatting.Bold);
            expect(model.serializeParts()).toEqual([{ text: "hello world!", type: "plain" }]);
        });
    });

    describe("formatRangeAsList", () => {
        const textOf = (model: EditorModel): string =>
            model
                .serializeParts()
                .map((p) => p.text)
                .join("");
        const selectAll = (model: EditorModel, length: number): ReturnType<EditorModel["startRange"]> =>
            model.startRange(model.positionForOffset(0, false), model.positionForOffset(length, false));

        it("should make every selected line a bullet", () => {
            const model = new EditorModel([pc.plain("one"), pc.newline(), pc.plain("two")], pc, renderer);
            formatRange(selectAll(model, 7), Formatting.BulletList);
            expect(textOf(model)).toBe("- one\n- two");
        });

        it("should number the selected lines from 1", () => {
            const model = new EditorModel([pc.plain("one"), pc.newline(), pc.plain("two")], pc, renderer);
            formatRange(selectAll(model, 7), Formatting.NumberedList);
            expect(textOf(model)).toBe("1. one\n2. two");
        });

        it("should take the markers off when every line already has them", () => {
            const model = new EditorModel([pc.plain("- one"), pc.newline(), pc.plain("- two")], pc, renderer);
            formatRange(selectAll(model, 11), Formatting.BulletList);
            expect(textOf(model)).toBe("one\ntwo");

            const numbered = new EditorModel([pc.plain("1. one"), pc.newline(), pc.plain("2. two")], pc, renderer);
            formatRange(selectAll(numbered, 13), Formatting.NumberedList);
            expect(textOf(numbered)).toBe("one\ntwo");
        });

        it("should change a bulleted list into a numbered one", () => {
            const model = new EditorModel([pc.plain("- one"), pc.newline(), pc.plain("- two")], pc, renderer);
            formatRange(selectAll(model, 11), Formatting.NumberedList);
            expect(textOf(model)).toBe("1. one\n2. two");
        });

        it("should finish a half-done list instead of removing it", () => {
            const model = new EditorModel([pc.plain("- one"), pc.newline(), pc.plain("two")], pc, renderer);
            formatRange(selectAll(model, 9), Formatting.BulletList);
            expect(textOf(model)).toBe("- one\n- two");
        });

        it("should skip empty lines, and number only the lines with text", () => {
            const model = new EditorModel([pc.plain("one"), pc.newline(), pc.newline(), pc.plain("two")], pc, renderer);
            formatRange(selectAll(model, 8), Formatting.NumberedList);
            expect(textOf(model)).toBe("1. one\n\n2. two");
        });

        it("should act on the caret's whole line", () => {
            const model = new EditorModel([pc.plain("one"), pc.newline(), pc.plain("hello world")], pc, renderer);
            formatRange(model.startRange(model.positionForOffset(15, false)), Formatting.BulletList);
            expect(textOf(model)).toBe("one\n- hello world");
        });
    });

    describe("formatRangeAsHeading", () => {
        it("should add and remove a heading marker on a line", () => {
            const model = new EditorModel([pc.plain("hello")], pc, renderer);
            const range = model.startRange(model.positionForOffset(0, false), model.positionForOffset(5, false));
            formatRange(range, Formatting.Heading);
            expect(model.serializeParts()).toEqual([{ text: "# hello", type: "plain" }]);

            const headed = model.startRange(model.positionForOffset(0, false), model.positionForOffset(7, false));
            formatRange(headed, Formatting.Heading);
            expect(
                model
                    .serializeParts()
                    .map((p) => p.text)
                    .join(""),
            ).toBe("hello");
        });

        it("should add a heading marker to every selected line", () => {
            const model = new EditorModel([pc.plain("one"), pc.newline(), pc.plain("two")], pc, renderer);
            const range = model.startRange(model.positionForOffset(0, false), model.positionForOffset(7, false));
            formatRange(range, Formatting.Heading);
            expect(
                model
                    .serializeParts()
                    .map((p) => p.text)
                    .join(""),
            ).toBe("# one\n# two");
        });

        // The docked bar makes a collapsed caret the normal case: block formats must act on the whole line
        it.each([
            ["hello world", 11, Formatting.Heading, "# hello world"],
            ["hello world", 11, Formatting.Quote, "> hello world\n"],
            ["hello world", 3, Formatting.Quote, "> hello world\n"],
            ["# hello", 7, Formatting.Heading, "hello"],
            ["# hello", 1, Formatting.Heading, "hello"],
        ])("should format the whole line for a caret in %j at %d with %s", (text, offset, formatting, expected) => {
            const model = new EditorModel([pc.plain(text)], pc, renderer);
            formatRange(model.startRange(model.positionForOffset(offset, false)), formatting);
            expect(
                model
                    .serializeParts()
                    .map((p) => p.text)
                    .join(""),
            ).toBe(expected);
        });

        it("should only format the caret's line in a multi-line message", () => {
            const model = new EditorModel([pc.plain("one"), pc.newline(), pc.plain("hello world")], pc, renderer);
            formatRange(model.startRange(model.positionForOffset(15, false)), Formatting.Heading);
            expect(
                model
                    .serializeParts()
                    .map((p) => p.text)
                    .join(""),
            ).toBe("one\n# hello world");
        });
    });

    describe("formatRangeAsLink", () => {
        it.each([
            // Caret is denoted by | in the expectation string
            ["testing", "[testing](|)", ""],
            ["testing", "[testing](foobar|)", "foobar"],
            ["[testing]()", "testing|", ""],
            ["[testing](foobar)", "testing|", ""],
        ])("converts %s -> %s", (input: string, expectation: string, text: string) => {
            const model = new EditorModel([pc.plain(`foo ${input} bar`)], pc, renderer);

            const range = model.startRange(
                model.positionForOffset(4, false),
                model.positionForOffset(4 + input.length, false),
            ); // around input

            expect(range.parts[0].text).toBe(input);
            formatRangeAsLink(range, text);
            expect((renderer.caret as DocumentPosition).offset).toBe(4 + expectation.indexOf("|"));
            expect(model.parts[0].text).toBe("foo " + expectation.replace("|", "") + " bar");
        });
    });

    describe("toggleInlineFormat", () => {
        it("works for words", () => {
            const model = new EditorModel([pc.plain("hello world!")], pc, renderer);

            const range = model.startRange(model.positionForOffset(6, false), model.positionForOffset(11, false)); // around "world"

            expect(range.parts[0].text).toBe("world");
            expect(model.serializeParts()).toEqual([{ text: "hello world!", type: "plain" }]);
            formatRange(range, Formatting.Italics);
            expect(model.serializeParts()).toEqual([{ text: "hello *world*!", type: "plain" }]);
        });

        describe("escape backticks", () => {
            it("works for escaping backticks in between texts", () => {
                const renderer = createRenderer();
                const pc = createPartCreator();
                const model = new EditorModel([pc.plain("hello ` world!")], pc, renderer);

                const range = model.startRange(model.positionForOffset(0, false), model.positionForOffset(13, false)); // hello ` world

                expect(range.parts[0].text.trim().includes("`")).toBeTruthy();
                expect(longestBacktickSequence(range.parts[0].text.trim())).toBe(1);
                expect(model.serializeParts()).toEqual([{ text: "hello ` world!", type: "plain" }]);
                formatRangeAsCode(range);
                expect(model.serializeParts()).toEqual([{ text: "``hello ` world``!", type: "plain" }]);
            });

            it("escapes longer backticks in between text", () => {
                const renderer = createRenderer();
                const pc = createPartCreator();
                const model = new EditorModel([pc.plain("hello```world")], pc, renderer);

                const range = model.startRange(model.positionForOffset(0, false), model.getPositionAtEnd()); // hello```world

                expect(range.parts[0].text.includes("`")).toBeTruthy();
                expect(longestBacktickSequence(range.parts[0].text)).toBe(3);
                expect(model.serializeParts()).toEqual([{ text: "hello```world", type: "plain" }]);
                formatRangeAsCode(range);
                expect(model.serializeParts()).toEqual([{ text: "````hello```world````", type: "plain" }]);
            });

            it("escapes non-consecutive with varying length backticks in between text", () => {
                const renderer = createRenderer();
                const pc = createPartCreator();
                const model = new EditorModel([pc.plain("hell```o`w`o``rld")], pc, renderer);

                const range = model.startRange(model.positionForOffset(0, false), model.getPositionAtEnd()); // hell```o`w`o``rld
                expect(range.parts[0].text.includes("`")).toBeTruthy();
                expect(longestBacktickSequence(range.parts[0].text)).toBe(3);
                expect(model.serializeParts()).toEqual([{ text: "hell```o`w`o``rld", type: "plain" }]);
                formatRangeAsCode(range);
                expect(model.serializeParts()).toEqual([{ text: "````hell```o`w`o``rld````", type: "plain" }]);
            });

            it("untoggles correctly if its already formatted", () => {
                const renderer = createRenderer();
                const pc = createPartCreator();
                const model = new EditorModel([pc.plain("```hello``world```")], pc, renderer);

                const range = model.startRange(model.positionForOffset(0, false), model.getPositionAtEnd()); // hello``world
                expect(range.parts[0].text.includes("`")).toBeTruthy();
                expect(longestBacktickSequence(range.parts[0].text)).toBe(3);
                expect(model.serializeParts()).toEqual([{ text: "```hello``world```", type: "plain" }]);
                formatRangeAsCode(range);
                expect(model.serializeParts()).toEqual([{ text: "hello``world", type: "plain" }]);
            });
            it("untoggles correctly it contains varying length of backticks between text", () => {
                const renderer = createRenderer();
                const pc = createPartCreator();
                const model = new EditorModel([pc.plain("````hell```o`w`o``rld````")], pc, renderer);

                const range = model.startRange(model.positionForOffset(0, false), model.getPositionAtEnd()); // hell```o`w`o``rld
                expect(range.parts[0].text.includes("`")).toBeTruthy();
                expect(longestBacktickSequence(range.parts[0].text)).toBe(4);
                expect(model.serializeParts()).toEqual([{ text: "````hell```o`w`o``rld````", type: "plain" }]);
                formatRangeAsCode(range);
                expect(model.serializeParts()).toEqual([{ text: "hell```o`w`o``rld", type: "plain" }]);
            });
        });

        it("works for parts of words", () => {
            const renderer = createRenderer();
            const pc = createPartCreator();
            const model = new EditorModel([pc.plain("hello world!")], pc, renderer);

            const range = model.startRange(model.positionForOffset(7, false), model.positionForOffset(10, false)); // around "orl"

            expect(range.parts[0].text).toBe("orl");
            expect(model.serializeParts()).toEqual([{ text: "hello world!", type: "plain" }]);
            toggleInlineFormat(range, "*");
            expect(model.serializeParts()).toEqual([{ text: "hello w*orl*d!", type: "plain" }]);
        });

        it("works for around pills", () => {
            const renderer = createRenderer();
            const pc = createPartCreator();
            const model = new EditorModel(
                [pc.plain("hello there "), pc.atRoomPill("@room"), pc.plain(", how are you doing?")],
                pc,
                renderer,
            );

            const range = model.startRange(model.positionForOffset(6, false), model.positionForOffset(30, false)); // around "there @room, how are you"

            expect(range.parts.map((p) => p.text).join("")).toBe("there @room, how are you");
            expect(model.serializeParts()).toEqual([
                { text: "hello there ", type: "plain" },
                { text: "@room", type: "at-room-pill" },
                { text: ", how are you doing?", type: "plain" },
            ]);
            formatRange(range, Formatting.Italics);
            expect(model.serializeParts()).toEqual([
                { text: "hello *there ", type: "plain" },
                { text: "@room", type: "at-room-pill" },
                { text: ", how are you* doing?", type: "plain" },
            ]);
        });

        it("works for a paragraph", () => {
            const renderer = createRenderer();
            const pc = createPartCreator();
            const model = new EditorModel(
                [pc.plain("hello world,"), pc.newline(), pc.plain("how are you doing?")],
                pc,
                renderer,
            );

            const range = model.startRange(model.positionForOffset(6, false), model.positionForOffset(16, false)); // around "world,\nhow"

            expect(range.parts.map((p) => p.text).join("")).toBe("world,\nhow");
            expect(model.serializeParts()).toEqual([
                { text: "hello world,", type: "plain" },
                SERIALIZED_NEWLINE,
                { text: "how are you doing?", type: "plain" },
            ]);
            formatRange(range, Formatting.Bold);
            expect(model.serializeParts()).toEqual([
                { text: "hello **world,", type: "plain" },
                SERIALIZED_NEWLINE,
                { text: "how** are you doing?", type: "plain" },
            ]);
        });

        it("works for a paragraph with spurious breaks around it in selected range", () => {
            const renderer = createRenderer();
            const pc = createPartCreator();
            const model = new EditorModel(
                [
                    pc.newline(),
                    pc.newline(),
                    pc.plain("hello world,"),
                    pc.newline(),
                    pc.plain("how are you doing?"),
                    pc.newline(),
                    pc.newline(),
                ],
                pc,
                renderer,
            );

            const range = model.startRange(model.positionForOffset(0, false), model.getPositionAtEnd()); // select-all

            expect(range.parts.map((p) => p.text).join("")).toBe("\n\nhello world,\nhow are you doing?\n\n");
            expect(model.serializeParts()).toEqual([
                SERIALIZED_NEWLINE,
                SERIALIZED_NEWLINE,
                { text: "hello world,", type: "plain" },
                SERIALIZED_NEWLINE,
                { text: "how are you doing?", type: "plain" },
                SERIALIZED_NEWLINE,
                SERIALIZED_NEWLINE,
            ]);
            formatRange(range, Formatting.Bold);
            expect(model.serializeParts()).toEqual([
                SERIALIZED_NEWLINE,
                SERIALIZED_NEWLINE,
                { text: "**hello world,", type: "plain" },
                SERIALIZED_NEWLINE,
                { text: "how are you doing?**", type: "plain" },
                SERIALIZED_NEWLINE,
                SERIALIZED_NEWLINE,
            ]);
        });

        it("works for multiple paragraph", () => {
            const renderer = createRenderer();
            const pc = createPartCreator();
            const model = new EditorModel(
                [
                    pc.plain("hello world,"),
                    pc.newline(),
                    pc.plain("how are you doing?"),
                    pc.newline(),
                    pc.newline(),
                    pc.plain("new paragraph"),
                ],
                pc,
                renderer,
            );

            let range = model.startRange(model.positionForOffset(0, true), model.getPositionAtEnd()); // select-all

            expect(model.serializeParts()).toEqual([
                { text: "hello world,", type: "plain" },
                SERIALIZED_NEWLINE,
                { text: "how are you doing?", type: "plain" },
                SERIALIZED_NEWLINE,
                SERIALIZED_NEWLINE,
                { text: "new paragraph", type: "plain" },
            ]);
            toggleInlineFormat(range, "__");
            expect(model.serializeParts()).toEqual([
                { text: "__hello world,", type: "plain" },
                SERIALIZED_NEWLINE,
                { text: "how are you doing?__", type: "plain" },
                SERIALIZED_NEWLINE,
                SERIALIZED_NEWLINE,
                { text: "__new paragraph__", type: "plain" },
            ]);
            range = model.startRange(model.positionForOffset(0, true), model.getPositionAtEnd()); // select-all
            toggleInlineFormat(range, "__");
            expect(model.serializeParts()).toEqual([
                { text: "hello world,", type: "plain" },
                SERIALIZED_NEWLINE,
                { text: "how are you doing?", type: "plain" },
                SERIALIZED_NEWLINE,
                SERIALIZED_NEWLINE,
                { text: "new paragraph", type: "plain" },
            ]);
        });

        it("format word at caret position at beginning of new line without previous selection", () => {
            const renderer = createRenderer();
            const pc = createPartCreator();
            const model = new EditorModel([pc.newline(), pc.plain("hello!")], pc, renderer);

            let range = model.startRange(model.positionForOffset(1, false));

            // Initial position should equal start and end since we did not select anything
            expect(range.getLastStartingPosition()).toBe(range.start);
            expect(range.getLastStartingPosition()).toBe(range.end);

            formatRange(range, Formatting.Bold); // Toggle

            expect(model.serializeParts()).toEqual([SERIALIZED_NEWLINE, { text: "**hello!**", type: "plain" }]);

            formatRange(range, Formatting.Bold); // Untoggle

            expect(model.serializeParts()).toEqual([SERIALIZED_NEWLINE, { text: "hello!", type: "plain" }]);

            // Check if it also works for code as it uses toggleInlineFormatting only indirectly
            range = model.startRange(model.positionForOffset(1, false));
            selectRangeOfWordAtCaret(range);

            formatRange(range, Formatting.Code); // Toggle

            expect(model.serializeParts()).toEqual([SERIALIZED_NEWLINE, { text: "`hello!`", type: "plain" }]);

            formatRange(range, Formatting.Code); // Untoggle
            expect(model.serializeParts()).toEqual([SERIALIZED_NEWLINE, { text: "hello!", type: "plain" }]);
        });

        it("caret resets correctly to current line when untoggling formatting while caret at line end", () => {
            const renderer = createRenderer();
            const pc = createPartCreator();
            const model = new EditorModel(
                [pc.plain("hello **hello!**"), pc.newline(), pc.plain("world")],
                pc,
                renderer,
            );

            expect(model.serializeParts()).toEqual([
                { text: "hello **hello!**", type: "plain" },
                SERIALIZED_NEWLINE,
                { text: "world", type: "plain" },
            ]);

            const endOfFirstLine = 16;
            const range = model.startRange(model.positionForOffset(endOfFirstLine, true));

            formatRange(range, Formatting.Bold); // Untoggle
            formatRange(range, Formatting.Italics); // Toggle

            // We expect formatting to still happen in the first line as the caret should not jump down
            expect(model.serializeParts()).toEqual([
                { text: "hello *hello!*", type: "plain" },
                SERIALIZED_NEWLINE,
                { text: "world", type: "plain" },
            ]);
        });

        it("format link in front of new line part", () => {
            const renderer = createRenderer();
            const pc = createPartCreator();
            const model = new EditorModel(
                [pc.plain("hello!"), pc.newline(), pc.plain("world!"), pc.newline()],
                pc,
                renderer,
            );

            let range = model.startRange(model.getPositionAtEnd().asOffset(model).add(-1).asPosition(model)); // select-all

            expect(model.serializeParts()).toEqual([
                { text: "hello!", type: "plain" },
                SERIALIZED_NEWLINE,
                { text: "world!", type: "plain" },
                SERIALIZED_NEWLINE,
            ]);

            formatRange(range, Formatting.InsertLink); // Toggle
            expect(model.serializeParts()).toEqual([
                { text: "hello!", type: "plain" },
                SERIALIZED_NEWLINE,
                { text: "[world!]()", type: "plain" },
                SERIALIZED_NEWLINE,
            ]);

            range = model.startRange(model.getPositionAtEnd().asOffset(model).add(-1).asPosition(model)); // select-all
            formatRange(range, Formatting.InsertLink); // Untoggle
            expect(model.serializeParts()).toEqual([
                { text: "hello!", type: "plain" },
                SERIALIZED_NEWLINE,
                { text: "world!", type: "plain" },
                SERIALIZED_NEWLINE,
            ]);
        });

        it("format multi line code", () => {
            const renderer = createRenderer();
            const pc = createPartCreator();
            const model = new EditorModel(
                [pc.plain("int x = 1;"), pc.newline(), pc.newline(), pc.plain("int y = 42;")],
                pc,
                renderer,
            );

            let range = model.startRange(model.positionForOffset(0), model.getPositionAtEnd()); // select-all

            expect(range.parts.map((p) => p.text).join("")).toBe("int x = 1;\n\nint y = 42;");

            expect(model.serializeParts()).toEqual([
                { text: "int x = 1;", type: "plain" },
                SERIALIZED_NEWLINE,
                SERIALIZED_NEWLINE,
                { text: "int y = 42;", type: "plain" },
            ]);

            formatRange(range, Formatting.Code); // Toggle

            expect(model.serializeParts()).toEqual([
                { text: "```", type: "plain" },
                SERIALIZED_NEWLINE,
                { text: "int x = 1;", type: "plain" },
                SERIALIZED_NEWLINE,
                SERIALIZED_NEWLINE,
                { text: "int y = 42;", type: "plain" },
                SERIALIZED_NEWLINE,
                { text: "```", type: "plain" },
            ]);

            range = model.startRange(model.positionForOffset(0, false), model.getPositionAtEnd()); // select-all
            formatRange(range, Formatting.Code); // Untoggle

            expect(model.serializeParts()).toEqual([
                { text: "int x = 1;", type: "plain" },
                SERIALIZED_NEWLINE,
                SERIALIZED_NEWLINE,
                { text: "int y = 42;", type: "plain" },
            ]);
        });

        it("does not format pure white space", () => {
            const renderer = createRenderer();
            const pc = createPartCreator();
            const model = new EditorModel(
                [pc.plain("       "), pc.newline(), pc.newline(), pc.plain("         ")],
                pc,
                renderer,
            );

            const range = model.startRange(model.positionForOffset(0), model.getPositionAtEnd()); // select-all
            expect(range.parts.map((p) => p.text).join("")).toBe("       \n\n         ");

            expect(model.serializeParts()).toEqual([
                { text: "       ", type: "plain" },
                SERIALIZED_NEWLINE,
                SERIALIZED_NEWLINE,
                { text: "         ", type: "plain" },
            ]);

            formatRange(range, Formatting.Bold);

            expect(model.serializeParts()).toEqual([
                { text: "       ", type: "plain" },
                SERIALIZED_NEWLINE,
                SERIALIZED_NEWLINE,
                { text: "         ", type: "plain" },
            ]);
        });
    });
});
