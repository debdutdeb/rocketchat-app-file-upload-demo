import {
    IHttp,
    IModify,
    IPersistence,
    IPersistenceRead,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import {
    RocketChatAssociationModel,
    RocketChatAssociationRecord,
} from "@rocket.chat/apps-engine/definition/metadata";
import { IFileUploadContext } from "@rocket.chat/apps-engine/definition/uploads";
import { FileUploadNotAllowedException } from "@rocket.chat/apps-engine/definition/exceptions";

class FileUploadHandler {
    private triggers: string[] = [];

    constructor() {
        // setInterval(() => {
        //     this.cleanUpState();
        // }, 10000);
    }

    public async startUpload(
        read: IPersistenceRead,
        persis: IPersistence,
        triggerId: string
    ) {
        const [attempt] = await read.readByAssociation(
            new RocketChatAssociationRecord(
                RocketChatAssociationModel.MISC,
                triggerId
            )
        );
        if (attempt) {
            throw new Error("upload already started for this trigger");
        }

        console.log("starting upload", triggerId);

        this.triggers.push(triggerId);

        return persis.createWithAssociation(
            { _createdAt: new Date() },
            new RocketChatAssociationRecord(
                RocketChatAssociationModel.MISC,
                triggerId
            )
        );
    }

    public async cleanUpState(read: IPersistenceRead, persis: IPersistence) {
        for (const triggerId of this.triggers) {
            const [attempt] = (await read.readByAssociation(
                new RocketChatAssociationRecord(
                    RocketChatAssociationModel.MISC,
                    triggerId
                )
            )) as { _createdAt: Date }[];

            if (!attempt) {
                continue;
            }

            if (Date.now() - attempt._createdAt.getTime() > 30000) {
                console.log("cleaning up state", triggerId);
                await persis.removeByAssociation(
                    new RocketChatAssociationRecord(
                        RocketChatAssociationModel.MISC,
                        triggerId
                    )
                );
            }
        }
    }

    private async getUpload(read: IPersistenceRead, triggerId: string) {
        const [attempt] = await read.readByAssociation(
            new RocketChatAssociationRecord(
                RocketChatAssociationModel.MISC,
                triggerId
            )
        );

        return attempt;
    }

    public async handle(
        context: IFileUploadContext,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify: IModify
    ) {
        // handle however you want
        // like reupload to someplace else
        // or in this case anything other than an attempt through this would be discarded
        const [filename, triggerId] = context.file.name.split("_triggerId=");
        if (
            !triggerId ||
            !(await this.getUpload(read.getPersistenceReader(), triggerId))
        ) {
            throw new FileUploadNotAllowedException(
                `upload wasn't started through the app`
            );
        }
        context.file.name = filename; // actual intended filename
    }

    setupCustomScript(appId: string) {
        return `
// ScriptOwner:${appId}:start
window.__uploadFileAppHijack = false;
window.__uploadNewFilename = "";

new MutationObserver(function __handleUploadButtonClick(mutationList) {
    const handleAppModal = (mutation) => {
        const nameInput = mutation.target.querySelector(
            "input[type=text][id^=upload_file_start_${appId}]"
        );
        if (!nameInput) {
            // This is't our modal

            return false;
        }

        const [, triggerId] = nameInput.id.split("_triggerId=");
        if (!triggerId) {
            throw new Error("could not detect trigger id");
        }

        /**
         * Since this is our modal, some changes to event handling are required
         * 1. Change state for modal close to do the right thing.
         * 2. Save the given filename to state
         * 3. When clicked on *our* button, quickly open the file modal
         */

        window.__uploadFileAppHijack = true;
        nameInput.onchange = function (event) {
            window.__uploadNewFilename = \`\${event.target.value}_triggerId=\${triggerId}\`; // this is the new filename
        };

        const butts = mutation.target.querySelectorAll('button[type="button"]');
        for (const butt of butts) {
            if (butt.innerText == "Choose a file") {
                butt.onclick = function () {
                    // hide the modal
                    mutation.target.style.display = "none";
                    // open the file upload modal
                    const button = document.querySelector(
                        '[data-qa-id="file-upload"]'
                    );
                    if (!button) {
                        console.log("no upload button found");
                        return;
                    }

                    button.click();
                };
                break;
            }
        }

        return true;
    };

    const handleFileUploadModal = (mutation) => {
        if (!window.__uploadFileAppHijack) {
            return;
        }
        window.__uploadFileAppHijack = false; // reset state

        const filenameInput =
            mutation.target.querySelector('input[type="text"]');
        if (!filenameInput) {
            throw new Error(
                "could not detect file upload modal's filename field"
            );
        }

        // set the new filename (also that change event actually gets caught by others)
        Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value"
        ).set.call(filenameInput, window.__uploadNewFilename);
        filenameInput.dispatchEvent(new Event("change", { bubbles: true }));

        // Immediately upload
        mutation.target.querySelector('button[type="submit"]').click();

        // reset state
        window.__uploadNewFilename = "";
    };

    for (const mutation of mutationList) {
        if (
            mutation.addedNodes.length == 1 &&
            mutation.target.id == "modal-root"
        ) {
            /**
             * A modal was open
             * This can be an app modal or any other ones
             * We gotta know if this is *our* modal or not
             */
            if (handleAppModal(mutation)) {
                // if we handled the modal, we're done here
                return;
            }

            /**
             * A modal opened, could be the file upload modal
             */
            handleFileUploadModal(mutation);
        }
    }
}).observe(document.body, {
    attributes: false,
    childList: true,
    subtree: true,
});

// ScriptOwner:${appId}:end
`;
    }
}

const upload = new FileUploadHandler();

export { upload };
