import { NavigationPlanningFeature } from "@/features/navigation/components/navigation-planning-feature";
import Head from "expo-router/head";

export default function PlanningPage() {
  return (
    <>
      <Head>
        <title>UniFACENS Map — Planejar percurso</title>
      </Head>
      <NavigationPlanningFeature />
    </>
  );
}
