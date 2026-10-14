import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { teamAccessFormSchema } from "shared";
import { useTeamAccessStore } from "@/stores/use-team-access-store";
import { verifyTeamAccess } from "../services/access-api";

export function useTeamAccessForm(onAuthorized: () => void) {
  const authorize = useTeamAccessStore((state) => state.authorize);
  const mutation = useMutation({ mutationFn: verifyTeamAccess });
  const form = useForm({
    defaultValues: { token: "" },
    validators: { onSubmit: teamAccessFormSchema },
    onSubmit: async ({ value }) => {
      const { token } = teamAccessFormSchema.parse(value);
      try {
        await mutation.mutateAsync(token);
        authorize(token);
        onAuthorized();
      } catch {
        /* O erro da mutação é mostrado sem expor a credencial. */
      }
    },
  });
  return { form, mutation };
}
