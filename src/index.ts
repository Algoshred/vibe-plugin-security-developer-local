/**
 * @vibecontrols/vibe-plugin-security-developer-local
 *
 * Gitleaks-protect + Semgrep --quick provider for developer.local.
 * Registers as a `security.secrets` provider (shares the secrets type
 * with the PR variant — see PROVIDER_TYPE_FOR_STAGE in
 * @vibecontrols/vibe-plugin-security/types) on the host's
 * ServiceRegistry. The user picks "gitleaks-protect-semgrep" as their
 * default provider for the `developer.local` stage and the meta plugin
 * dispatches.
 */
import { ProviderRegistry, TelemetryEmitter, createLifecycleHooks } from "@vibecontrols/plugin-sdk";
import type {
  HostServices,
  ProfileContext,
  VibePlugin,
  VibePluginFactory,
} from "@vibecontrols/plugin-sdk/contract";

import { GitleaksProtectSemgrepProvider } from "./provider.js";

const PLUGIN_NAME = "security-developer-local";
const PLUGIN_VERSION = "2026.528.1";

export const createPlugin: VibePluginFactory = (_ctx: ProfileContext): VibePlugin => {
  const provider = new GitleaksProtectSemgrepProvider();
  const telemetry = new TelemetryEmitter(PLUGIN_NAME, PLUGIN_VERSION);

  const lifecycle = createLifecycleHooks({
    name: PLUGIN_NAME,
    telemetryEventName: "security.developer-local.ready",
    onInit: async (host: HostServices) => {
      await provider.init(host);
      const registry = new ProviderRegistry(host);
      registry.registerProvider("security.secrets", "gitleaks-protect-semgrep", provider);
      telemetry.emit("security.developer-local.registered", {
        provider: "gitleaks-protect-semgrep",
        toolVersion: provider.toolVersion,
      });
    },
  });

  return {
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    description: "Local pre-commit secrets + quick SAST for the developer.local lifecycle stage.",
    tags: ["backend", "provider", "integration"],
    capabilities: {
      storage: "rw",
      subprocess: true,
      audit: true,
      telemetry: true,
    },
    onServerStart: lifecycle.onServerStart,
    onServerStop: lifecycle.onServerStop,
  };
};

export default createPlugin;
export { GitleaksProtectSemgrepProvider } from "./provider.js";
