export async function webAppDotNetCoreRuntimeConverter(dotnetcoreVersion: string) {
    return "DOTNETCORE|" + dotnetcoreVersion.replace("netcoreapp", "");
}