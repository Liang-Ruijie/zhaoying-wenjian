// The public static build has no model service. Local builds retain the proxy.
export const PUBLIC_BUILD=typeof __PUBLIC_BUILD__!=='undefined'&&__PUBLIC_BUILD__;
