import { NoteEditor } from "./NoteEditor";
import { NotePreview } from "./NotePreview";
import { NoteTree } from "./NoteTree";

export function NotesView() {
  return (
    <div className="notes">
      <NoteTree />
      <NoteEditor />
      <NotePreview />
    </div>
  );
}
