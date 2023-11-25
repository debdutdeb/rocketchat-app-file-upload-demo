import {
    IRead,
    IModify,
    IHttp,
    IPersistence,
} from "@rocket.chat/apps-engine/definition/accessors";
import {
    ISlashCommand,
    SlashCommandContext,
} from "@rocket.chat/apps-engine/definition/slashcommands";
import {
    TextObjectType,
    UIKitSurfaceType,
} from "@rocket.chat/apps-engine/definition/uikit";
import { UploadFileDemoApp } from "./UploadFileDemoApp";

export class TriggerCommand implements ISlashCommand {
    public command = "upload";
    public i18nDescription: string = "";
    public i18nParamsExample: string = "";
    public providesPreview: boolean = false;

    app: UploadFileDemoApp;

    constructor(app: UploadFileDemoApp) {
        this.app = app;
    }

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<void> {
        // this triggerId controls further uploads
        const triggerId = context.getTriggerId();
        if (!triggerId) {
            return;
        }

        const blocks = modify.getCreator().getBlockBuilder();

        blocks.addInputBlock({
            label: {
                type: TextObjectType.PLAINTEXT,
                text: "File",
            },
            element: blocks.newPlainTextInputElement({
                initialValue: "",
                multiline: false,
                placeholder: { type: TextObjectType.PLAINTEXT, text: "File" },
                // this adds the id to the input element the custom script will observer
                // to not collide with some other element with id "upload", app id is appended;
                // Appending triggerId to pass and catch state later;
                actionId: `upload_file_start_${this.app.getID()}_triggerId=${triggerId}`,
            }),
            blockId: "upload",
        });

        await modify.getUiController().openSurfaceView(
            {
                id: "upload",
                type: UIKitSurfaceType.MODAL,
                title: {
                    type: TextObjectType.PLAINTEXT,
                    text: "Upload a file",
                },
                blocks: blocks.getBlocks(),
                submit: blocks.newButtonElement({
                    text: { type: TextObjectType.PLAINTEXT, text: "Choose a file" },
                }),
            },
            { triggerId },
            context.getSender()
        );
    }
}
