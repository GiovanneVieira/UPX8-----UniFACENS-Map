import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { placesQuerySchema, type Place, type PlaceCategory } from "shared";
import { usePlacesStore } from "@/stores/use-places-store";
import { useShallow } from "zustand/react/shallow";
import { usePlaceQuery, usePlacesQuery } from "../queries/use-places-query";
import type { PlaceFilters } from "../services/places-api";

export function usePlacesExplorer() {
  const [filters, setFilters] = useState<PlaceFilters>({ search: "" });
  const [editor, setEditor] = useState<"create" | "edit" | null>(null);
  const [notice, setNotice] = useState("");
  const { selectedId, selectPlace } = usePlacesStore(
    useShallow((state) => ({
      selectedId: state.selectedPlaceId,
      selectPlace: state.selectPlace,
    })),
  );
  const query = usePlacesQuery(filters);
  const details = usePlaceQuery(selectedId);
  const searchForm = useForm({
    defaultValues: { search: "" },
    validators: {
      onSubmit: placesQuerySchema.pick({ search: true }).required(),
    },
    onSubmit: ({ value }) => {
      selectPlace(null);
      setFilters((current) => ({ ...current, search: value.search.trim() }));
    },
  });
  function selectCategory(category?: PlaceCategory) {
    selectPlace(null);
    setFilters((current) => ({ ...current, category }));
  }
  function onSaved(place: Place) {
    setEditor(null);
    selectPlace(place.id);
    setNotice(
      editor === "edit"
        ? "Local atualizado. As informações precisam de nova verificação."
        : "Local cadastrado. As informações ainda precisam de verificação.",
    );
  }
  return {
    filters,
    query,
    details,
    selectedId,
    selectPlace,
    searchForm,
    selectCategory,
    places: query.data?.pages.flatMap((page) => page.items) ?? [],
    total: query.data?.pages[0]?.total ?? 0,
    editor,
    setEditor,
    onSaved,
    notice,
  };
}
