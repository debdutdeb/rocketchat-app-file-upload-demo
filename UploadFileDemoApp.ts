import {
    IAppAccessors,
    IConfigurationExtend,
    IConfigurationModify,
    IEnvironmentRead,
    IHttp,
    ILogger,
    IModify,
    IPersistence,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import { App } from "@rocket.chat/apps-engine/definition/App";
import { IAppInfo } from "@rocket.chat/apps-engine/definition/metadata";
import { TriggerCommand } from "./Trigger";
import {
    IFileUploadContext,
    IPreFileUpload,
} from "@rocket.chat/apps-engine/definition/uploads";
import {
    IUIKitInteractionHandler,
    IUIKitResponse,
    UIKitViewSubmitInteractionContext,
} from "@rocket.chat/apps-engine/definition/uikit";
import { upload } from "./FileUploadHandler";
import { StartupType } from "@rocket.chat/apps-engine/definition/scheduler";
import { ISetting } from "@rocket.chat/apps-engine/definition/settings";

class UploadFileDemoApp
    extends App
    implements IPreFileUpload, IUIKitInteractionHandler
{
    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    async executePreFileUpload(
        context: IFileUploadContext,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify: IModify
    ): Promise<void> {
        return upload.handle(context, read, http, persis, modify);
    }

    async executeViewSubmitHandler(
        context: UIKitViewSubmitInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify
    ): Promise<IUIKitResponse> {
        const data = context.getInteractionData();
        if (data.view.id !== "upload") {
            return { success: true };
        }

        const { upload: file } = data.view.state as any;

        const triggerId = Object.keys(file)[0].split("_triggerId=")[1];

        upload.startUpload(read.getPersistenceReader(), persistence, triggerId);

        return { success: true };
    }

    protected async extendConfiguration(
        configuration: IConfigurationExtend,
        environmentRead: IEnvironmentRead
    ): Promise<void> {
        await configuration.slashCommands.provideSlashCommand(
            new TriggerCommand(this)
        );

        // since setInterval isn't working
        await configuration.scheduler.registerProcessors([
            {
                id: "cleanup-upload-state",
                startupSetting: {
                    type: StartupType.RECURRING,
                    skipImmediate: true,
                    interval: 30000, // every 30 seconds is enough
                },
                async processor(jobContext, read, modify, http, persis) {
                    upload.cleanUpState(read.getPersistenceReader(), persis);
                },
            },
        ]);
    }

    async onEnable(
        environment: IEnvironmentRead,
        configurationModify: IConfigurationModify
    ): Promise<boolean> {
        // add custom script to the browser client
        const setting: ISetting = await environment
            .getServerSettings()
            .getOneById("Custom_Script_Logged_In");
        if (setting.value) {
            if (setting.value.includes(`ScriptOwner:${this.getID()}:start`)) {
                return true;
            }
            setting.value += upload.setupCustomScript(this.getID());
        } else {
            setting.value = upload.setupCustomScript(this.getID());
        }
        await configurationModify.serverSettings.modifySetting(setting);
        return true;
    }

    async onDisable(configurationModify: IConfigurationModify): Promise<void> {
        const setting: ISetting = await this.getAccessors()
            .environmentReader.getServerSettings()
            .getOneById("Custom_Script_Logged_In");
        if (!setting.value) {
            return;
        }

        let newValue = "";
        const lines = setting.value.split("\n");

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(`ScriptOwner:${this.getID()}:start`)) {
                while (!lines[i].includes(`ScriptOwner:${this.getID()}:end`)) {
                    i++;
                }
            }
            newValue += lines[i] + "\n";
        }

        setting.value = newValue;

        return configurationModify.serverSettings.modifySetting(setting);
    }
}

export { UploadFileDemoApp };
