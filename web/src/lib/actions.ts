import { toast } from "sonner"

import { useSwitch } from "./api"

/** Flip a safeguard in Shield's policy, with feedback and an undo. */
export function useToggleSafeguard(canSwitch: boolean) {
  const sw = useSwitch()
  const toggle = (id: string, name: string, enabled: boolean) => {
    if (!canSwitch) {
      toast.error("Switches are read-only here", { description: "Set target.policy_file in redteam.yaml (demo/up.sh does it)." })
      return
    }
    sw.mutate({ id, enabled }, {
      onSuccess: () => toast(enabled ? `${name} switched back on` : `${name} switched off`, {
        description: "Shield's policy file was edited. The test is repeating now.",
        action: enabled ? undefined : { label: "Undo", onClick: () => sw.mutate({ id, enabled: true }) },
      }),
      onError: (e) => toast.error(e.message),
    })
  }
  return { toggle, pending: sw.isPending ? sw.variables?.id : undefined }
}
