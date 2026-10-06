/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

export interface PreviewIssue {
  readonly number: number;
  readonly title?: string;
  readonly labels?: readonly (string | { readonly name?: string })[];
}

export interface PreviewMilestone {
  readonly id: string;
  readonly name: string;
}

export interface PreviewFloorChoice {
  readonly floor: number | null;
  readonly reason: string;
}

export function floorTagsFromSource(source: string): Record<string, number>;
export function floorNamedIn(text: string | undefined): number | null;
export function closedIssueNumbers(body: string | undefined): number[];
export function issueFloor(
  issue: PreviewIssue,
  milestones: readonly PreviewMilestone[],
): number | null;
export function pathFloor(path: string, floorTags: Readonly<Record<string, number>>): number | null;
export function choosePreviewFloor(input: {
  readonly body: string | undefined;
  readonly issues: readonly PreviewIssue[];
  readonly files: readonly string[];
  readonly milestones: readonly PreviewMilestone[];
  readonly floorTags: Readonly<Record<string, number>>;
}): PreviewFloorChoice;
