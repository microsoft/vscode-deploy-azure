import { SubscriptionModels } from "azure-arm-resource";
import { isNullOrUndefined } from "util";
import { AzureSession, extensionVariables } from "../model/models";
import { Messages } from "../resources/messages";

export function getSubscriptionSession(subscriptionId: string): AzureSession {
    let currentSubscription: { session: AzureSession, subscription: SubscriptionModels.Subscription } = extensionVariables.azureAccountExtensionApi.subscriptions
        .find((subscription) =>
            subscription.subscription.subscriptionId.toLowerCase() === subscriptionId.toLowerCase());

    // Fallback to first element
    if (!currentSubscription) {
        currentSubscription = extensionVariables.azureAccountExtensionApi.subscriptions[0];
    }

    return currentSubscription.session;
}

export function getAzureSession(): AzureSession {
    const currentSubscription = extensionVariables.azureAccountExtensionApi.subscriptions[0];
    if (isNullOrUndefined(currentSubscription)) {
        throw new Error(Messages.AzureLoginError);
    }

    return currentSubscription.session;
}