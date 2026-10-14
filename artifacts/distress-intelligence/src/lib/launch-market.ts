import { launchCounties } from "@workspace/api-zod";

export const launchMarket = {
  shortLabel: "Houston + DFW",
  assetClassLabel: "Estate / probate pilot",
  areas: [
    {
      label: "Houston area",
      counties: launchCounties.filter(
        ({ metro }) => metro === "Houston area",
      ),
    },
    {
      label: "Dallas–Fort Worth",
      counties: launchCounties.filter(
        ({ metro }) => metro === "Dallas–Fort Worth",
      ),
    },
  ],
} satisfies {
  shortLabel: string;
  assetClassLabel: string;
  areas: { label: string; counties: typeof launchCounties[number][] }[];
};
