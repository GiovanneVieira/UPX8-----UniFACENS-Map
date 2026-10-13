import { useForm } from "@tanstack/react-form";
import {
  createPlaceFormSchema,
  type Place,
  type PlaceFormValues,
} from "shared";
import { useState } from "react";
import { useSavePlaceMutation } from "../queries/use-places-query";
import { placePositionSchema, type PlacePosition } from "shared";

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

export function usePlaceForm(
  onSaved: (place: Place) => void,
  initialPlace?: Place,
) {
  const mutation = useSavePlaceMutation();
  const [isPickingPosition, setPickingPosition] = useState(false);
  const [positionNotice, setPositionNotice] = useState("");
  const form = useForm({
    defaultValues: initialPlace
      ? {
          name: initialPlace.name,
          category: initialPlace.category,
          latitude: String(initialPlace.latitude),
          longitude: String(initialPlace.longitude),
          building: initialPlace.building ?? "",
          floor: initialPlace.floor === null ? "" : String(initialPlace.floor),
          description: initialPlace.description ?? "",
          source: initialPlace.source,
        }
      : defaultValues,
    validators: { onSubmit: createPlaceFormSchema },
    onSubmit: async ({ value }) => {
      try {
        const place = await mutation.mutateAsync({
          id: initialPlace?.id,
          dto: createPlaceFormSchema.parse(value),
        });
        onSaved(place);
      } catch {
        // A mutação mantém o erro visível e os campos preenchidos para nova tentativa.
      }
    },
  });
  function selectPosition(position: PlacePosition) {
    const parsed = placePositionSchema.safeParse(position);
    if (!parsed.success) return;
    form.setFieldValue("latitude", String(parsed.data.latitude));
    form.setFieldValue("longitude", String(parsed.data.longitude));
    setPositionNotice(
      "Posição selecionada. Confira as coordenadas antes de salvar.",
    );
  }
  return {
    form,
    mutation,
    isPickingPosition,
    setPickingPosition,
    positionNotice,
    selectPosition,
  };
}
