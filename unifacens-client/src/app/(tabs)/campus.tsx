import Head from "expo-router/head";
import { PlacesFeature } from "@/features/places/components/places-feature";

export function CampusTab() {
  return (
    <>
      <Head>
        <title>UniFACENS Map — Locais do campus</title>
      </Head>
      <PlacesFeature />
    </>
  );
}

export default CampusTab;
