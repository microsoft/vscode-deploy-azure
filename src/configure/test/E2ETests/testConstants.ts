import { GenericResource } from "azure-arm-resource/lib/resource/models";
import { BasicAuthenticationCredentials } from "ms-rest";
import { AzureEnvironment } from 'ms-rest-azure';

export class TestConstants {
    public static extensionId = "ms-vscode-deploy-azure.azure-deploy";

    public static userName = process.env.Azure_UserName || "vimimrot@microsoft.com";
    public static AzurePAT = process.env.Azure_PAT || "ltieun33kps4sn7ys4a7zbybc73w7htynjypxpaesr2bnb2nvdfq";
    public static GithubPAT = process.env.GithubPAT || "f3a7efaeebab40560a706b5b5a79fc61edf4c358";
    public static PublishProfile = process.env.PublishProfile || "DummyPublishProfile";

    public static credentials = new BasicAuthenticationCredentials(TestConstants.userName, TestConstants.AzurePAT);

    public static shortGuid = "test";

    public static session = {
        userId: TestConstants.userName,
        tenantId: "72f988bf-86f1-41af-91ab-2d7cd011db47",
        credentials: TestConstants.credentials,
        environment: AzureEnvironment.Azure
    }

    public static subscription = {
        id: "/subscriptions/c00d16c7-6c1f-4c03-9be1-6934a4c49682",
        subscriptionId: "c00d16c7-6c1f-4c03-9be1-6934a4c49682",
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
        id: "/subscriptions/c00d16c7-6c1f-4c03-9be1-6934a4c49682/resourceGroups/vnmtestlinux93c8/providers/Microsoft.Web/sites/vnm-demo",
        name: "vnm-demo",
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