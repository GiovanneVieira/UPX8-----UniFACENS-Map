import { PlacesFeature } from "@/features/places/components/places-feature";
import Head from "expo-router/head";

export default function HomeScreen() {
  return (
    <>
      <Head>
        <title>UniFACENS Map — Locais do campus</title>
      </Head>
      <PlacesFeature />
    </>
  );
}
