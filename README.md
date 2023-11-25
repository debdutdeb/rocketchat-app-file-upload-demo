This is an example app that can intercept file uploads or trigger them itself.

Apps Engine currently (the date of this line's blame) does not support triggering file uploads from the client. We can upload using `UploadCreator` but that's if we have access to the file buffer already, like a link for instance. If the file lives on the user's computer, apps-engine can't access it.

# Opening a file upload modal

This we can do _easily_-ish by using a custom client side javascript.

Once we click on some buttom of our app modal, we can open the file modal instantly -

```js
const button = document.querySelector('[data-qa-id="file-upload"]');
button.click();
```

This partly solves the problem.

Next problem is how do I know what logic should catch the file?

# There is no connection between an app trigger and a file upload trigger

One thing to understand here, is that the file upload mechanism, that we trigger using the javascript, has no idea an app is running or waiting to intercept the upload.

Similarly, since the app itself can't trigger anything, it has no idea when the file upload is happening.

One solution is to somehow share some state or identifier between the two events. So when the app intercepts, it can look for the identifier and know it has to handle the upload.

_How?_

I am using `triggerId` for this.

# Using triggerId to share state

1. The moment we trigger the app, `context.getTriggerId()` is the start of our upload. The app saves its state.
2. The trigger id is appended to the app modal's `input` element id, `_triggerId=${triggerId}`
3. The javascript on the client, grabs the id, then on the file upload modal, appends it to the filename the same way, then immediately uploads.

```js
// more on emitting the change event on the actual code
filenameinput.value = window.__uploadnewfilename;
mutation.target.queryselector('button[type="submit"]').click();
```

On the app, it sees the id, fixes the filename, then handles it however it wants;

```ts
const [filename, triggerId] = context.file.name.split("_triggerId=");
const exists = await this.getUpload(read.getPersistenceReader(), triggerId);
if (!triggerId || !exists) {
    throw new FileUploadNotAllowedException(
        `upload wasn't started through the app`
    );
}
context.file.name = filename; // restore file name
```

# The problems

1. We don't have clear control over what is set on dom element attributes, from the app. `blockId`, `id`, `actionId` etc none are guranteed to be put in any app property. So eventually this may break. If the input element looses the id we set it to (`upload_file_start_${app-id}_triggerId={id}`), the flow breaks.
2. triggerIds can change whenever. **It does not control, dictate, or identify a flow** - this means I have to handle our own state this way and can't rely on them for a flow control (or "start" uploads a little later to avoid stale state)
3. I don't know how `triggerId`s are generated, therefore can't gurantee their uniqueness. But to be sure, the app here won't let another upload to start if one is already in progress with the same identifier.

I am probably forgetting to write something else down here. But this is the gist of it, I think. The custom script that in inline in the file upload class file, is the same that is in the `custom-script.js` file. Copied by hand.

The code is ofc messy (we gotta say this all the time :P) and also commented.

Alright, bye :^)
