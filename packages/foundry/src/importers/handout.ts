import type { Handout } from "@dnd-toolkit/core";
import { handoutToBlob } from "../render-handout.ts";
import { ensureFolder, esc, MODULE_ID } from "../util.ts";
import { uploadImage } from "./scene.ts";

/**
 * A journal with the handout as an image page the players can see (observer) and a GM-only page
 * with the truth behind it. Returns the journal and its image page.
 */
export async function createHandoutJournal(h: Handout): Promise<{ journal: any; image: any }> {
  const src = await uploadImage(await handoutToBlob(h), `handout-${h.kind}-${h.seed.replace(/[^\w-]/g, "_")}-${Date.now()}.webp`);
  const { OBSERVER, NONE } = CONST.DOCUMENT_OWNERSHIP_LEVELS;
  const journal = await JournalEntry.create({
    name: h.title,
    folder: await ensureFolder("JournalEntry"),
    pages: [
      { name: h.title, type: "image", src, ownership: { default: OBSERVER } },
      { name: "GM notes", type: "text", ownership: { default: NONE }, text: { content: `<p>${h.lines.map(esc).join("<br>")}</p><p><em>${esc(h.footer)}</em></p><p><strong>The truth:</strong> ${esc(h.gmNote)}</p>` } },
    ],
    flags: { [MODULE_ID]: { kind: "handout", seed: h.seed } },
  });
  return { journal, image: journal.pages.find((p: any) => p.type === "image") };
}

/** Foundry's own "show to players" dialog for the image page. */
export function showToPlayers(page: any) {
  const Journal = (globalThis as any).Journal;
  if (Journal?.showDialog) return Journal.showDialog(page);
  page?.parent?.sheet?.render(true);
}
