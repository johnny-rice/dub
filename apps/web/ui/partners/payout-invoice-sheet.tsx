import { confirmPayoutsAction } from "@/lib/actions/partners/confirm-payouts";
import { exceededLimitError } from "@/lib/api/errors";
import { clientAccessCheck } from "@/lib/api/tokens/permissions";
import { DIRECT_DEBIT_PAYMENT_METHOD_TYPES } from "@/lib/partners/constants";
import {
  CUTOFF_PERIOD,
  CUTOFF_PERIOD_TYPES,
} from "@/lib/partners/cutoff-period";
import { calculatePayoutFeeForMethod } from "@/lib/payment-methods";
import usePaymentMethods from "@/lib/swr/use-payment-methods";
import useWorkspace from "@/lib/swr/use-workspace";
import { PayoutResponse, PlanProps } from "@/lib/types";
import { X } from "@/ui/shared/icons";
import {
  Button,
  buttonVariants,
  CreditCard,
  DynamicTooltipWrapper,
  Gear,
  GreekTemple,
  PaperPlane,
  Sheet,
  ShimmerDots,
  SimpleTooltipContent,
  Table,
  TooltipContent,
  useRouterStuff,
  useTable,
} from "@dub/ui";
import {
  capitalize,
  cn,
  currencyFormatter,
  fetcher,
  formatDate,
  OG_AVATAR_URL,
  truncate,
} from "@dub/utils";
import { useAction } from "next-safe-action/hooks";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import Stripe from "stripe";
import useSWR from "swr";

const PAYMENT_METHODS = Object.freeze({
  link: {
    label: "link",
    type: "link",
    icon: CreditCard,
    duration: "Instantly",
  },
  card: {
    label: "card",
    type: "card",
    icon: CreditCard,
    duration: "Instantly",
  },
  us_bank_account: {
    label: "ACH",
    type: "us_bank_account",
    icon: GreekTemple,
    duration: "4 business days",
  },
  acss_debit: {
    label: "ACSS Debit",
    type: "acss_debit",
    icon: GreekTemple,
    duration: "5 business days",
  },
  sepa_debit: {
    label: "SEPA Debit",
    type: "sepa_debit",
    icon: GreekTemple,
    duration: "5 business days",
  },
});

type SelectPaymentMethod =
  (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS] & {
    id: string;
    fee: number;
  };

function PayoutInvoiceSheetContent() {
  const router = useRouter();
  const {
    id: workspaceId,
    slug,
    plan,
    role,
    defaultProgramId,
    payoutsUsage,
    payoutsLimit,
    payoutFee,
  } = useWorkspace();

  const { paymentMethods, loading: paymentMethodsLoading } =
    usePaymentMethods();

  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<SelectPaymentMethod | null>(null);

  const [cutoffPeriod, setCutoffPeriod] =
    useState<CUTOFF_PERIOD_TYPES>("today");

  const {
    data: eligiblePayouts,
    error: eligiblePayoutsError,
    isLoading: eligiblePayoutsLoading,
  } = useSWR<PayoutResponse[]>(
    `/api/programs/${defaultProgramId}/payouts/eligible?${new URLSearchParams({
      workspaceId,
      cutoffPeriod,
    } as Record<string, any>).toString()}`,
    fetcher,
  );

  const [excludedPayoutIds, setExcludedPayoutIds] = useState<string[]>([]);

  const includedPayouts = useMemo(
    () =>
      eligiblePayouts?.filter(
        (payout) => !excludedPayoutIds.includes(payout.id),
      ),
    [eligiblePayouts, excludedPayoutIds],
  );

  const { executeAsync: confirmPayouts } = useAction(confirmPayoutsAction, {
    onError({ error }) {
      toast.error(error.serverError);
    },
  });

  const finalPaymentMethods = useMemo(
    () =>
      paymentMethods?.map((pm) => {
        const paymentMethod = PAYMENT_METHODS[pm.type];

        const base = {
          ...paymentMethod,
          id: pm.id,
          fee: calculatePayoutFeeForMethod({
            paymentMethod: pm.type,
            payoutFee,
          }),
        };

        if (pm.link) {
          return {
            ...base,
            title: `Link – ${truncate(pm.link.email, 16)}`,
          };
        }

        if (pm.card) {
          return {
            ...base,
            title: `${capitalize(pm.card.brand)} **** ${pm.card.last4}`,
          };
        }

        return {
          ...base,
          title: `${paymentMethod.label} **** ${pm[paymentMethod.type]?.last4}`,
        };
      }),
    [paymentMethods, plan],
  );

  useEffect(() => {
    if (
      !selectedPaymentMethod &&
      finalPaymentMethods &&
      finalPaymentMethods.length > 0
    ) {
      setSelectedPaymentMethod(finalPaymentMethods[0]);
    }
  }, [finalPaymentMethods, selectedPaymentMethod]);

  const { amount, fee, total } = useMemo(() => {
    const amount = includedPayouts?.reduce((acc, payout) => {
      return acc + payout.amount;
    }, 0);

    const fee =
      amount === undefined
        ? undefined
        : amount * (selectedPaymentMethod?.fee ?? 0);
    const total =
      amount !== undefined && fee !== undefined ? amount + fee : undefined;

    return { amount, fee, total };
  }, [includedPayouts, selectedPaymentMethod]);

  const invoiceData = useMemo(() => {
    return [
      {
        key: "Method",
        value: (
          <div className="flex items-center gap-2 pr-6">
            {paymentMethodsLoading ? (
              <div className="h-[26px] w-40 animate-pulse rounded-md bg-neutral-200" />
            ) : (
              <select
                className="h-auto flex-1 rounded-md border border-neutral-200 py-1.5 text-xs focus:border-neutral-600 focus:ring-neutral-600"
                value={selectedPaymentMethod?.id || ""}
                onChange={(e) =>
                  setSelectedPaymentMethod(
                    finalPaymentMethods?.find(
                      (pm) => pm.id === e.target.value,
                    ) || null,
                  )
                }
              >
                {finalPaymentMethods?.map(({ id, title }) => (
                  <option key={id} value={id}>
                    {title}
                  </option>
                ))}
              </select>
            )}
            <a
              href={`/${slug}/settings/billing`}
              className={cn(
                buttonVariants({ variant: "secondary" }),
                "flex items-center rounded-md border border-neutral-200 p-1.5 text-sm",
              )}
              target="_blank"
            >
              <Gear className="size-4" />
            </a>
          </div>
        ),
      },
      {
        key: "Cutoff Period",
        value: (
          <select
            value={cutoffPeriod}
            className="h-auto w-fit rounded-md border border-neutral-200 py-1 text-xs focus:border-neutral-600 focus:ring-neutral-600"
            onChange={(e) => setCutoffPeriod(e.target.value)}
          >
            {CUTOFF_PERIOD.map(({ id, label, value }) => (
              <option key={id} value={id}>
                {label} ({formatDate(value)})
              </option>
            ))}
          </select>
        ),
        tooltipContent:
          "Cutoff period in UTC. If set, only commissions accrued up to the cutoff period will be included in the payout invoice.",
      },
      {
        key: "Partners",
        value: eligiblePayouts?.length ?? (
          <div className="h-4 w-24 animate-pulse rounded-md bg-neutral-200" />
        ),
      },
      {
        key: "Amount",
        value:
          amount === undefined ? (
            <div className="h-4 w-24 animate-pulse rounded-md bg-neutral-200" />
          ) : (
            currencyFormatter(amount / 100, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          ),
      },
      {
        key: "Fee",
        value:
          selectedPaymentMethod && fee !== undefined ? (
            currencyFormatter(fee / 100, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          ) : (
            <div className="h-4 w-24 animate-pulse rounded-md bg-neutral-200" />
          ),
        tooltipContent: selectedPaymentMethod ? (
          <SimpleTooltipContent
            title={`${selectedPaymentMethod.fee * 100}% processing fee. ${!DIRECT_DEBIT_PAYMENT_METHOD_TYPES.includes(selectedPaymentMethod.type as Stripe.PaymentMethod.Type) ? " Switch to Direct Debit for a reduced fee." : ""}`}
            cta="Learn more"
            href="https://d.to/payouts"
          />
        ) : undefined,
      },
      {
        key: "Transfer Time",
        value: selectedPaymentMethod ? (
          selectedPaymentMethod.duration
        ) : (
          <div className="h-4 w-24 animate-pulse rounded-md bg-neutral-200" />
        ),
      },
      {
        key: "Total",
        value:
          total === undefined ? (
            <div className="h-4 w-24 animate-pulse rounded-md bg-neutral-200" />
          ) : (
            currencyFormatter(total / 100, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          ),
      },
    ];
  }, [amount, paymentMethods, selectedPaymentMethod, cutoffPeriod]);

  const partnerColumn = useMemo(
    () => ({
      header: "Partner",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <img
            src={
              row.original.partner.image ||
              `${OG_AVATAR_URL}${row.original.partner.name}`
            }
            alt={row.original.partner.name}
            className="size-6 rounded-full"
          />
          <span className="text-sm text-neutral-700">
            {row.original.partner.name}
          </span>
        </div>
      ),
    }),
    [],
  );

  const table = useTable({
    data: eligiblePayouts || [],
    columns: [
      partnerColumn,
      {
        id: "total",
        header: "Total",
        cell: ({ row }) => (
          <>
            <div className="relative">
              <span
                className={cn(
                  "group-hover/row:opacity-0",
                  excludedPayoutIds.includes(row.original.id) && "line-through",
                )}
              >
                {currencyFormatter(row.original.amount / 100, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <div className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover/row:pointer-events-auto group-hover/row:opacity-100">
                <Button
                  variant="secondary"
                  text={
                    excludedPayoutIds.includes(row.original.id)
                      ? "Include"
                      : "Exclude"
                  }
                  className="h-6 w-fit px-2"
                  onClick={() =>
                    // Toggle excluded
                    setExcludedPayoutIds((ids) =>
                      ids.includes(row.original.id)
                        ? ids.filter((id) => id !== row.original.id)
                        : [...ids, row.original.id],
                    )
                  }
                />
              </div>
            </div>
          </>
        ),
      },
    ],
    thClassName: (id) =>
      cn(id === "total" && "[&>div]:justify-end", "border-l-0"),
    tdClassName: (id, row) =>
      cn(
        "transition-opacity",
        excludedPayoutIds.includes(row.original.id) && [
          "[&>div]:opacity-50",
          id === "total" && "group-hover/row:[&>div]:opacity-100",
        ], // Excluded payout
        id === "total" && "text-right",
        "border-l-0",
      ),
    className: "[&_tr:last-child>td]:border-b-transparent",
    scrollWrapperClassName: "min-h-[40px]",
    resourceName: (p) => `eligible payout${p ? "s" : ""}`,
    loading: eligiblePayoutsLoading,
    error: eligiblePayoutsError
      ? "Failed to load payouts for this invoice."
      : undefined,
  });

  const { error: permissionsError } = clientAccessCheck({
    role,
    action: "payouts.write",
    customPermissionDescription: "confirm payouts",
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b border-neutral-200 px-6 py-4">
        <Sheet.Title className="text-lg font-semibold">
          Payout invoice
        </Sheet.Title>
        <Sheet.Close asChild>
          <Button
            variant="outline"
            icon={<X className="size-5" />}
            className="h-auto w-fit p-1"
          />
        </Sheet.Close>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-6">
          <div className="text-base font-medium text-neutral-900">
            Invoice details
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            {invoiceData.map(({ key, value, tooltipContent }) => (
              <Fragment key={key}>
                <div
                  className={cn(
                    "flex items-center py-0.5 font-medium text-neutral-500",
                    tooltipContent &&
                      "cursor-help underline decoration-dotted underline-offset-2",
                  )}
                >
                  <DynamicTooltipWrapper
                    tooltipProps={
                      tooltipContent
                        ? {
                            content: tooltipContent,
                          }
                        : undefined
                    }
                  >
                    {key}
                  </DynamicTooltipWrapper>
                </div>
                <div className="col-span-2 flex items-center text-neutral-800">
                  {value}
                </div>
              </Fragment>
            ))}
          </div>
        </div>

        <div className="p-6 pt-2">
          <Table {...table} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-neutral-200 p-5">
        <ConfirmPayoutsButton
          onClick={async () => {
            if (!workspaceId || !selectedPaymentMethod) {
              return false;
            }

            const result = await confirmPayouts({
              workspaceId,
              paymentMethodId: selectedPaymentMethod.id,
              cutoffPeriod,
              excludedPayoutIds,
              amount: amount ?? 0,
              fee: fee ?? 0,
              total: total ?? 0,
            });

            if (!result?.data?.invoiceId) return false;

            setTimeout(
              () =>
                result?.data?.invoiceId &&
                router.push(
                  `/${slug}/program/payouts/success?invoiceId=${result.data.invoiceId}`,
                ),
              1000,
            );

            return true;
          }}
          text={
            amount && amount > 0
              ? `Hold to confirm ${currencyFormatter(amount / 100, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} payout`
              : "Hold to confirm payout"
          }
          disabled={
            eligiblePayoutsLoading || !selectedPaymentMethod || amount === 0
          }
          disabledTooltip={
            payoutsUsage &&
            payoutsLimit &&
            amount &&
            payoutsUsage + amount > payoutsLimit ? (
              <TooltipContent
                title={exceededLimitError({
                  plan: plan as PlanProps,
                  limit: payoutsLimit,
                  type: "payouts",
                })}
                cta="Upgrade"
                href={`/${slug}/settings/billing/upgrade`}
              />
            ) : (
              permissionsError || undefined
            )
          }
        />
      </div>
    </div>
  );
}

export function PayoutInvoiceSheet() {
  const { queryParams } = useRouterStuff();
  const [isOpen, setIsOpen] = useState(false);
  const { searchParams } = useRouterStuff();

  useEffect(() => {
    const confirmPayouts = searchParams.get("confirmPayouts");

    if (confirmPayouts) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }, [searchParams]);

  return (
    <Sheet
      open={isOpen}
      onOpenChange={setIsOpen}
      onClose={() => {
        queryParams({
          del: "confirmPayouts",
        });
      }}
    >
      <PayoutInvoiceSheetContent />
    </Sheet>
  );
}

function ConfirmPayoutsButton({
  onClick,
  text,
  disabled,
  disabledTooltip,
}: {
  onClick: () => Promise<boolean>;
  text: string;
  disabled: boolean;
  disabledTooltip: React.ReactNode;
}) {
  const loadingBar = useRef<HTMLDivElement>(null);

  const holding = useRef(false);
  const progress = useRef(0);

  const requestRef = useRef<number | null>();
  const previousTimeRef = useRef();

  // Rounded progress to nearest tenth
  const [roundedProgress, setRoundedProgress] = useState(0);

  const [isSuccess, setIsSuccess] = useState(false);

  const animate = (time) => {
    if (previousTimeRef.current !== undefined) {
      const deltaTime = time - previousTimeRef.current;

      if (progress.current < 1) {
        progress.current = Math.max(
          0,
          Math.min(
            1,
            progress.current + deltaTime * (holding.current ? 0.0005 : -0.001),
          ),
        );

        setRoundedProgress(Math.round(progress.current * 10) / 10);

        if (loadingBar.current)
          loadingBar.current.style.width = `${progress.current * 100}%`;
      }
    }

    previousTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  };

  const submitting = useRef(false);

  // Submit when the progress is >= 1 and not already submitting
  useEffect(() => {
    if (roundedProgress < 1 || submitting.current) return;

    submitting.current = true;
    onClick()
      .then((result) => {
        if (result) {
          setIsSuccess(true);
        } else {
          progress.current = 0;
          setRoundedProgress(0);
          submitting.current = false;
        }
      })
      .catch(() => {
        progress.current = 0;
        setRoundedProgress(0);
        submitting.current = false;
      });
  }, [roundedProgress]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current!);
  }, []);

  return (
    <Button
      type="button"
      variant="primary"
      className={cn(
        "relative overflow-hidden",
        isSuccess && "border-green-500 bg-green-500",
      )}
      textWrapperClassName="!overflow-visible"
      {...(!disabled &&
        !disabledTooltip && {
          // TODO: Handle keyboard control
          onPointerDown: () => (holding.current = true),
          onPointerUp: () => (holding.current = false),
          onPointerLeave: () => (holding.current = false),
          onPointerCancel: () => (holding.current = false),
        })}
      text={
        <>
          <div
            ref={loadingBar}
            className={cn(
              "pointer-events-none absolute inset-y-0 left-0 overflow-hidden",
              !isSuccess && "bg-[linear-gradient(90deg,#fff1,#fff4)]",
            )}
          >
            <ShimmerDots
              className="inset-[unset] inset-y-0 left-0 w-[600px] opacity-30"
              color={[1, 1, 1]}
            />
          </div>
          <div className="relative text-center">
            <div
              className={cn(
                "transition-[transform,opacity] duration-300",
                roundedProgress >= 0.5 && "-translate-y-4 opacity-0",
              )}
            >
              {text}
            </div>
            <div
              className={cn(
                "pointer-events-none absolute inset-0 transition-[transform,opacity] duration-300",
                roundedProgress < 0.5 && "translate-y-4 opacity-0",
                roundedProgress >= 1 && "-translate-y-4 opacity-0",
              )}
              aria-hidden
            >
              Preparing payout...
            </div>
            <div
              className={cn(
                "pointer-events-none absolute inset-0 flex items-center justify-center transition-[transform,opacity] duration-300",
                roundedProgress < 1 && "-translate-x-1 translate-y-4 opacity-0",
                roundedProgress >= 1 &&
                  isSuccess &&
                  "-translate-y-4 translate-x-3 opacity-0",
              )}
              aria-hidden
            >
              <PaperPlane className="size-4" />
            </div>
            <div
              className={cn(
                "pointer-events-none absolute inset-0 flex items-center justify-center transition-[transform,opacity] duration-300",
                (roundedProgress < 1 || !isSuccess) &&
                  "translate-y-4 opacity-0",
              )}
              aria-hidden
            >
              Payout sent
            </div>
          </div>
        </>
      }
      disabled={disabled}
      disabledTooltip={disabledTooltip}
    />
  );
}
