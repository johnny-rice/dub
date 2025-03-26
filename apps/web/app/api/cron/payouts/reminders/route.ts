import { handleAndReturnErrorResponse } from "@/lib/api/errors";
import { limiter } from "@/lib/cron/limiter";
import { verifyVercelSignature } from "@/lib/cron/verify-vercel";
import { sendEmail } from "@dub/email";
import ConnectPayoutReminder from "@dub/email/templates/connect-payout-reminder";
import { prisma } from "@dub/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// This route is used to send reminders to partners who have pending payouts
// but haven't configured payouts yet.
// Runs every day but only notifies partners every 3 days
// GET /api/cron/payouts/reminders
export async function GET(req: Request) {
  try {
    // TODO: RESTORE THIS
    await verifyVercelSignature(req);

    const pendingPayouts = await prisma.payout.groupBy({
      by: ["partnerId", "programId"],
      where: {
        status: "pending",
        partner: {
          createdAt: {
            lte: new Date(Date.now() - 12 * 60 * 60 * 1000), // Partner is at least 12 hours old
          },
          OR: [
            {
              lastNotifiedConnectPayout: {
                lte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // Last notified was at least 3 days ago
              },
            },
            { lastNotifiedConnectPayout: null },
          ],
          payoutsEnabledAt: null,
        },
      },
      _sum: {
        amount: true,
      },
      orderBy: {
        _sum: {
          amount: "desc",
        },
      },
    });

    if (!pendingPayouts.length) {
      return NextResponse.json({
        success: true,
        message: `No action needed`,
      });
    }

    const partnerData = await prisma.partner.findMany({
      where: {
        id: {
          in: pendingPayouts.map((payout) => payout.partnerId),
        },
      },
    });

    const programData = await prisma.program.findMany({
      where: {
        id: {
          in: pendingPayouts.map((payout) => payout.programId),
        },
      },
    });

    const partnerPrograms = pendingPayouts.reduce(
      (acc, payout) => {
        const { partnerId, programId } = payout;
        const { amount } = payout._sum;

        const partner = partnerData.find((p) => p.id === partnerId);
        const program = programData.find((p) => p.id === programId);
        if (!partner?.email || !program) {
          return acc;
        }

        acc[partner.email] = acc[partner.email] || [];
        acc[partner.email].push({
          amount: amount ?? 0,
          partner: {
            name: partner.name,
            email: partner.email,
          },
          program: {
            id: program.id,
            name: program.name,
            logo: program.logo,
          },
        });
        return acc;
      },
      {} as Record<
        string,
        Array<{ amount: number; partner: any; program: any }>
      >,
    );

    await Promise.all(
      Object.entries(partnerPrograms).map(([partnerEmail, data]) =>
        limiter.schedule(async () => {
          // Update last notified date
          await prisma.partner.update({
            where: {
              email: partnerEmail,
            },
            data: {
              lastNotifiedConnectPayout: new Date(),
            },
          });

          await sendEmail({
            subject: `Connect your payout details on Dub Partners`,
            email: partnerEmail,
            react: ConnectPayoutReminder({
              email: partnerEmail,
              programs: data.map(({ program, amount }) => ({
                id: program.id,
                name: program.name,
                logo: program.logo,
                amount,
              })),
            }),
            variant: "notifications",
          });
        }),
      ),
    );

    return NextResponse.json({
      success: true,
      message: `Queued ${Object.keys(partnerPrograms).length} email(s)`,
    });
  } catch (error) {
    return handleAndReturnErrorResponse(error);
  }
}
