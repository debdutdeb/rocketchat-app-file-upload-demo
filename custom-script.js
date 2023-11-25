window.__uploadFileAppHijack = false;
window.__uploadNewFilename = "";

new MutationObserver(function __handleUploadButtonClick(mutationList) {
    const handleAppModal = (mutation) => {
        const nameInput = mutation.target.querySelector(
            // "input[type=text][id^=upload_file_start_${appId}]"
            "input[type=text][id^=upload_file_start_109fbcd1-4907-47c7-8648-ecec08b8cbea]"
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
            window.__uploadNewFilename = `${event.target.value}_triggerId=${triggerId}`; // this is the new filename
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
