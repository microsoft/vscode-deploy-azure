import { GenericResource } from "azure-arm-resource/lib/resource/models";
import { BasicAuthenticationCredentials } from "ms-rest";
import { AzureEnvironment } from 'ms-rest-azure';

export class TestConstants {
    public static extensionId = "ms-vscode-deploy-azure.azure-deploy";

    public static userName = process.env.Azure_UserName;
    public static AzurePAT = process.env.Azure_PAT;
    public static GithubPAT = process.env.GITHUB_TOKEN;
    public static PublishProfile = process.env.PublishProfile || "DummyPublishProfile";

    public static credentials = new BasicAuthenticationCredentials(TestConstants.userName, TestConstants.AzurePAT);

    public static shortGuid = "test";

    public static session = {
        userId: TestConstants.userName,
        tenantId: "f7841ef5-a478-4164-8a1e-e8e95a786cd7",
        credentials: TestConstants.credentials,
        environment: AzureEnvironment.Azure
    }

    public static subscription = {
        id: "/subscriptions/8f67c458-5874-41fe-8cf9-f3b0429be6ff",
        subscriptionId: "8f67c458-5874-41fe-8cf9-f3b0429be6ff",
        displayName: "RMDev"
    }

    public static subscriptionData = {
        label: TestConstants.subscription.displayName,
        data: {
            session: TestConstants.session,
            subscription: TestConstants.subscription
        },
        description: TestConstants.subscription.subscriptionId
    };

    public static windowsWebAppResource = <GenericResource>{
        id: "/subscriptions/8f67c458-5874-41fe-8cf9-f3b0429be6ff/resourceGroups/vnmtestlinux93c8/providers/Microsoft.Web/sites/test-app",
        name: "test-app",
        type: "Microsoft.Web/sites",
        kind: "app"
    };

    public static windowsWebAppResourceData = {
        label: TestConstants.windowsWebAppResource.name,
        data: TestConstants.windowsWebAppResource
    };

    public static azureAccountExtensionAPI = {
        sessions: [TestConstants.session],
        subscriptions: [{ session: TestConstants.session, subscription: TestConstants.subscription }],
        filters: [{ session: TestConstants.session, subscription: TestConstants.subscription }],
        waitForLogin: () => Promise.resolve(true),
        waitForSubscriptions: () => Promise.resolve(true)
    }
}