/**
 * Shared "save this file somewhere the author picks" fallback for the room
 * editor (#24) and pixel editor (#108) when there is no dev server to POST
 * to — a CI-published preview build (`.github/workflows/ci.yml`'s `preview`
 * job) is a static `vite build` output with nothing listening on
 * `/__room-editor-api/`/`/__pixel-editor-api/` at all. Both editors branch on
 * `import.meta.env.DEV` in their own `api-client.ts` and call this instead
 * of `fetch`-ing the dev-only endpoint.
 *
 * `showSaveFilePicker` (Chromium) opens a real "Save As" dialog so the
 * author can aim the file straight at their local checkout's
 * `assets/sprites/`/`src/content/rooms/`; Firefox and Safari don't implement
 * it, so those fall back to a plain `<a download>` blob, which lands in the
 * browser's configured downloads folder instead and has to be moved by
 * hand — worse, but not broken.
 *
 * There is no `.d.ts` for this API in TypeScript's own DOM lib yet (it is
 * still Chromium-only), so the two pieces this module actually calls are
 * declared locally rather than reaching for a global ambient declaration
 * that would claim to describe the whole API.
 */

interface SaveFilePickerWritable {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

interface SaveFilePickerHandle {
  createWritable(): Promise<SaveFilePickerWritable>;
}

type ShowSaveFilePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<SaveFilePickerHandle>;

function getSaveFilePicker(): ShowSaveFilePicker | undefined {
  return (window as unknown as { showSaveFilePicker?: ShowSaveFilePicker }).showSaveFilePicker;
}

export interface FileExportResult {
  readonly ok: boolean;
  readonly cancelled?: boolean;
  readonly error?: string;
}

function extensionOf(fileName: string): string {
  const dot = fileName.indexOf('.');
  return dot === -1 ? '' : fileName.slice(dot);
}

/** Saves `blob` as `suggestedName`, via a native save dialog where available, a plain download otherwise. */
export async function exportFile(
  suggestedName: string,
  blob: Blob,
  description: string,
): Promise<FileExportResult> {
  const picker = getSaveFilePicker();
  if (picker !== undefined) {
    try {
      const handle = await picker({
        suggestedName,
        types: [
          {
            description,
            accept: { [blob.type || 'application/octet-stream']: [extensionOf(suggestedName)] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { ok: true };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { ok: false, cancelled: true };
      }
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = suggestedName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return { ok: true };
}
