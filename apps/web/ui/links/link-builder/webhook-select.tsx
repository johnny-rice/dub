import useWebhooks from "@/lib/swr/use-webhooks";
import useWorkspace from "@/lib/swr/use-workspace";
import { LinkFormData } from "@/ui/links/link-builder/link-builder-provider";
import { Button, Combobox, useKeyboardShortcut, Webhook } from "@dub/ui";
import { cn } from "@dub/utils";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";

export function WebhookSelect() {
  const [isOpen, setIsOpen] = useState(false);
  const { watch, setValue } = useFormContext<LinkFormData>();
  const { webhooks: availableWebhooks } = useWebhooks();

  const { link } = useParams() as { link: string | string[] };

  useKeyboardShortcut("w", () => setIsOpen(true), {
    modal: link ? false : true,
  });

  const webhookIds = watch("webhookIds") as string[];

  const options = useMemo(
    () =>
      availableWebhooks?.map((webhook) => ({
        label: webhook.name,
        value: webhook.id,
        icon: <Webhook className="size-3.5" />,
      })),
    [availableWebhooks],
  );

  const selectedWebhooks = useMemo(
    () =>
      webhookIds
        .map((id) => options?.find(({ value }) => value === id)!)
        .filter(Boolean),

    [webhookIds, options],
  );

  const hasSelectedWebhooks = selectedWebhooks.length > 0;

  return (
    <Combobox
      multiple
      selected={selectedWebhooks || []}
      setSelected={(webhooks) => {
        const selectedIds = webhooks.map(({ value }) => value);
        setValue("webhookIds", selectedIds, { shouldDirty: true });
      }}
      options={options}
      icon={
        <Webhook
          className={cn(
            "size-3.5 flex-none",
            hasSelectedWebhooks && "text-blue-500",
          )}
        />
      }
      side="top"
      placeholder="Webhooks"
      searchPlaceholder="Search webhooks..."
      shortcutHint="W"
      buttonProps={{
        className:
          "h-8 text-xs gap-1.5 px-2.5 w-fit font-medium text-neutral-700 max-w-48 min-w-0",
      }}
      open={isOpen}
      onOpenChange={setIsOpen}
      emptyState={<NoWebhooksFound />}
    >
      {selectedWebhooks.length > 0
        ? selectedWebhooks.length === 1
          ? selectedWebhooks[0].label
          : `${selectedWebhooks.length} Webhooks`
        : "Webhooks"}
    </Combobox>
  );
}

const NoWebhooksFound = () => {
  const { slug } = useWorkspace();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-2 py-4 text-center text-sm">
      <div className="flex items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
        <Webhook className="size-6 text-neutral-700" />
      </div>
      <p className="mt-2 font-medium text-neutral-950">No webhooks found</p>
      <p className="mx-auto mt-1 w-full max-w-[180px] text-neutral-700">
        Add a webhook to receive a click event when someone clicks your link.
      </p>
      <div>
        <Button
          className="mt-1 h-8"
          onClick={() => window.open(`/${slug}/settings/webhooks`, "_blank")}
          text="Add webhook"
        />
      </div>
    </div>
  );
};
