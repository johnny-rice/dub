import useWorkspace from "@/lib/swr/use-workspace";
import { LinkFormData } from "@/ui/links/link-builder/link-builder-provider";
import {
  CrownSmall,
  InfoTooltip,
  SimpleTooltipContent,
  Switch,
  TooltipContent,
  useKeyboardShortcut,
} from "@dub/ui";
import { useParams } from "next/navigation";
import { memo } from "react";
import { useFormContext, useWatch } from "react-hook-form";

// Show new badge for 30 days
const isNew =
  new Date().getTime() - new Date("2025-01-13").getTime() < 30 * 86_400_000;

export const ConversionTrackingToggle = memo(() => {
  const { slug, plan } = useWorkspace();
  const { control, setValue } = useFormContext<LinkFormData>();

  const conversionsEnabled = !!plan && plan !== "free" && plan !== "pro";

  const trackConversion = useWatch({ control, name: "trackConversion" });

  const { link } = useParams() as { link: string | string[] };

  useKeyboardShortcut(
    "c",
    () => setValue("trackConversion", !trackConversion, { shouldDirty: true }),
    { modal: link ? false : true, enabled: conversionsEnabled },
  );

  return (
    <label className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {isNew && (
          <div className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[0.625rem] uppercase leading-none text-green-900">
            New
          </div>
        )}
        <span className="flex select-none items-center gap-1 text-sm font-medium text-neutral-700">
          Conversion Tracking
          <InfoTooltip
            content={
              <SimpleTooltipContent
                title="View analytics on conversions from your short links."
                cta="Learn more."
                href="https://dub.co/docs/conversions/quickstart"
              />
            }
          />
        </span>
      </div>
      <Switch
        checked={trackConversion}
        fn={(checked) =>
          setValue("trackConversion", checked, {
            shouldDirty: true,
          })
        }
        disabledTooltip={
          conversionsEnabled ? undefined : (
            <TooltipContent
              title="Conversion tracking is only available on Business plans and above."
              cta="Upgrade to Business"
              href={slug ? `/${slug}/upgrade` : "https://dub.co/pricing"}
              target="_blank"
            />
          )
        }
        thumbIcon={
          conversionsEnabled ? undefined : (
            <CrownSmall className="size-full text-neutral-500" />
          )
        }
      />
    </label>
  );
});
