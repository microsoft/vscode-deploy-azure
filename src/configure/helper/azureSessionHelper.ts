import { SubscriptionModels } from "azure-arm-resource";
import { AzureSession, extensionVariables } from "../model/models";

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
    let currentSubscription = extensionVariables.azureAccountExtensionApi.subscriptions[0];
    return currentSubscription.session;
}
