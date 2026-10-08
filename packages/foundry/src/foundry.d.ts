// Minimal ambient declarations for Foundry VTT globals. Swap for
// @league-of-foundry-developers/foundry-vtt-types once they track v13 closely.
declare const game: any;
declare const ui: any;
declare const canvas: any;
declare const foundry: any;
declare const CONST: any;
declare const Hooks: any;
declare const Scene: any;
declare const JournalEntry: any;
declare const Item: any;
declare const Actor: any;
declare const FilePicker: any;
declare const Folder: any;
declare const ChatMessage: any;
declare const TokenDocument: any;
declare function fromUuid(uuid: string): Promise<any>;
declare const CONFIG: any;
