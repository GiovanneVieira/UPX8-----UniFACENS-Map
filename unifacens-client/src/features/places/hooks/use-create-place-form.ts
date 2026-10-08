import { useForm } from "@tanstack/react-form";
import {
  createPlaceFormSchema,
  type Place,
  type PlaceFormValues,
} from "shared";
import { useCreatePlaceMutation } from "../queries/use-places-query";

const defaultValues: PlaceFormValues = {
  name: "",
  category: "building",
  latitude: "",
  longitude: "",
  building: "",
  floor: "",
  description: "",
  source: "team_report",
};

export function useCreatePlaceForm(onCreated: (place: Place) => void) {
  const mutation = useCreatePlaceMutation();
  const form = useForm({
    defaultValues,
    validators: { onSubmit: createPlaceFormSchema },
    onSubmit: async ({ value }) => {
      try {
        const place = await mutation.mutateAsync(
          createPlaceFormSchema.parse(value),
        );
        onCreated(place);
      } catch {
        // A mutação mantém o erro visível e os campos preenchidos para nova tentativa.
      }
    },
  });
  return { form, mutation };
}
