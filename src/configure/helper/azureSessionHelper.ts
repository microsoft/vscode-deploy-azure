import { SubscriptionModels } from "azure-arm-resource";
import { isNullOrUndefined } from "util";
import { AzureSession, extensionVariables } from "../model/models";
import { Messages } from "../resources/messages";
import { WhiteListedError } from "../utilities/utilities";

export async function getSubscriptionSession(subscriptionId: string): Promise<AzureSession> {
    if (!(await extensionVariables.azureAccountExtensionApi.waitForSubscriptions())) {
        throw new Error(Messages.AzureLoginError);
    }

    let currentSubscription: { session: AzureSession, subscription: SubscriptionModels.Subscription } = extensionVariables.azureAccountExtensionApi.subscriptions
        .find((subscription) =>
            subscription.subscription.subscriptionId.toLowerCase() === subscriptionId.toLowerCase());

    // Fallback to first element
    if (!currentSubscription) {
        currentSubscription = extensionVariables.azureAccountExtensionApi.subscriptions[0];
    }

    return currentSubscription.session;
}

export async function getAzureSession(): Promise<AzureSession> {
    if (!(await extensionVariables.azureAccountExtensionApi.waitForSubscriptions())) {
        throw new Error(Messages.AzureLoginError);
    }

    const currentSubscription = extensionVariables.azureAccountExtensionApi.subscriptions[0];
    if (isNullOrUndefined(currentSubscription)) {
        throw new WhiteListedError(Messages.NoAzureSubscriptionFound);
    }

    return currentSubscription.session;
}