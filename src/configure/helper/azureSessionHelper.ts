import { SubscriptionModels } from "azure-arm-resource";
import { isNullOrUndefined } from "util";
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

export async function getAzureSession(): Promise<AzureSession> {
    let currentSubscription = extensionVariables.azureAccountExtensionApi.subscriptions[0];
    while (isNullOrUndefined(currentSubscription)) {
        // tslint:disable-next-line: no-string-based-set-timeout
        await new Promise((resolve) => setTimeout(resolve, 1000));
        currentSubscription = extensionVariables.azureAccountExtensionApi.subscriptions[0];
    }

    return currentSubscription.session;
}
