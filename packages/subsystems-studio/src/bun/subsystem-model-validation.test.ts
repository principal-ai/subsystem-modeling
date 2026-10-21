import { describe, expect, test } from "bun:test";
import { findSubsystemModelProblems } from "./subsystem-model-validation";

function payload(partial: Record<string, unknown>): Record<string, unknown> {
  return {
    title: "t",
    components: [],
    ...partial,
  };
}

describe("findSubsystemModelProblems", () => {
  test("accepts a valid document", () => {
    expect(
      findSubsystemModelProblems(
        payload({
          components: [
            { alias: "a", name: "A", construct: "function", file: "src/a.ts", purl: "pkg:github/a/b" },
            { alias: "b", name: "B", construct: "class", file: "src/b.ts", purl: "pkg:github/a/b" },
          ],
        }),
      ),
    ).toEqual([]);
  });

  test("requires a site construct on calls steps", () => {
    const problems = findSubsystemModelProblems(
      payload({
        components: [
          { alias: "a", name: "A", construct: "function", file: "src/a.ts", purl: "pkg:github/a/b" },
          { alias: "b", name: "B", construct: "function", file: "src/b.ts", purl: "pkg:github/a/b" },
        ],
        trails: [
          {
            id: "t",
            title: "call",
            steps: [
              {
                from: "a",
                to: "b",
                mechanism: "calls",
                file: "src/a.ts",
                purl: "pkg:github/a/b#src/a.ts",
                symbol: "a",
              },
            ],
          },
        ],
      }),
    );
    expect(problems.some((p) => p.includes("site"))).toBe(true);
  });

  test("allows uses steps without a site construct", () => {
    expect(
      findSubsystemModelProblems(
        payload({
          components: [
            { alias: "a", name: "A", construct: "function", file: "src/a.ts", purl: "pkg:github/a/b" },
            { alias: "b", name: "B", construct: "function", file: "src/b.ts", purl: "pkg:github/a/b" },
          ],
          trails: [
            {
              id: "t",
              title: "use",
              steps: [
                {
                  from: "a",
                  to: "b",
                  mechanism: "uses",
                  file: "src/a.ts",
                  purl: "pkg:github/a/b#src/a.ts",
                  symbol: "a",
                },
              ],
            },
          ],
        }),
      ),
    ).toEqual([]);
  });

  test("rejects an off-vocabulary construct (schema)", () => {
    const problems = findSubsystemModelProblems(
      payload({
        components: [{ alias: "a", name: "A", construct: "widget", file: "src/a.ts", purl: "pkg:github/a/b" }],
      }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]!).toContain("allowed:");
    expect(problems[0]!).toContain("function");
  });

  test("rejects a module without a file (cross-field)", () => {
    const problems = findSubsystemModelProblems(
      payload({
        components: [{ alias: "a", name: "A", construct: "function", file: "", purl: "pkg:github/a/b", module: "src/host" }],
      }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]!).toContain("file is empty");
  });

  test("rejects a node_modules file (schema)", () => {
    const problems = findSubsystemModelProblems(
      payload({
        components: [
          {
            alias: "dep",
            name: "SharedHighlighter",
            construct: "store",
            file: "packages/subsystems-react/node_modules/@pierre/diffs/dist/highlighter/shared_highlighter.js",
            purl: "external",
          },
        ],
      }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]!).toContain("pattern");
  });

  test("accepts a third-party dependency modeled as an external package", () => {
    expect(
      findSubsystemModelProblems(
        payload({
          components: [
            {
              alias: "dep",
              name: "@pierre/diffs highlighter",
              construct: "external",
              file: "",
              purl: "pkg:npm/@pierre/diffs",
            },
          ],
        }),
      ),
    ).toEqual([]);
  });
});
