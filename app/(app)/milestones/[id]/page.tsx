"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useApp } from "@/components/AppProvider";
import JourneyStepper from "@/components/JourneyStepper";
import MilestoneDetail from "@/components/MilestoneDetail";
import { postMutation } from "@/components/demo-client";
import type { DeliverPayload } from "@/components/DeliverForm";

export default function MilestoneDetailPage() {
  const params = useParams<{ id: string }>();
  const app = useApp();
  const { state, session, busyKey, loadError, retryLoad } = app;

  if (!state) {
    return (
      <main className="page">
        <div className="panel loading-panel">
          {loadError ? (
            <>
              <p className="alert" role="alert">
                Could not load demo state: {loadError}
              </p>
              <button type="button" className="btn primary" onClick={retryLoad}>
                Retry
              </button>
            </>
          ) : (
            <p>Loading milestone…</p>
          )}
        </div>
      </main>
    );
  }

  const milestone = state.milestones.find((m) => m.id === params.id);

  if (!milestone) {
    return (
      <main className="page">
        <p>
          <Link href="/milestones" className="text-link">
            ← Back to milestones
          </Link>
        </p>
        <div className="panel">
          <h1>Milestone not found</h1>
          <p className="muted">
            This milestone does not exist in the seeded demo project.
          </p>
        </div>
      </main>
    );
  }

  const deliverable = state.deliverables
    .filter((d) => d.milestoneId === milestone.id)
    .at(-1);
  const verification = state.verifications
    .filter((v) => v.milestoneId === milestone.id)
    .at(-1);

  return (
    <main className="page detail-page">
      <p className="back-row">
        <Link href="/milestones" className="text-link">
          ← Back to milestones
        </Link>
      </p>

      <section className="stepper-band" aria-label="Milestone journey">
        <div className="stepper-band-head">
          <h1>{milestone.title}</h1>
          <span className={`state-badge state-${milestone.state.toLowerCase()}`}>
            {milestone.state}
          </span>
        </div>
        <JourneyStepper state={milestone.state} />
      </section>

      <MilestoneDetail
        milestone={milestone}
        project={state.project}
        role={session.role}
        busyKey={busyKey}
        deliverable={deliverable}
        verification={verification}
        onDeliver={(payload: DeliverPayload) =>
          app.runMutation("deliver", () =>
            postMutation(`/api/milestones/${milestone.id}/deliver`, {
              note: payload.note,
              link: payload.link,
              filename: payload.filename,
              extractedText: payload.extractedText,
            }),
          )
        }
        onDecide={() =>
          app.runMutation("decide", () =>
            postMutation(`/api/milestones/${milestone.id}/decide`),
          )
        }
        onApprove={() =>
          app.runMutation("approve", () =>
            postMutation(`/api/milestones/${milestone.id}/approve`),
          )
        }
        onReject={() =>
          app.runMutation("reject", () =>
            postMutation(`/api/milestones/${milestone.id}/reject`),
          )
        }
        onRerun={() =>
          app.runMutation("rerun", () =>
            postMutation(`/api/milestones/${milestone.id}/rerun`),
          )
        }
        onState={app.applyFundingState}
        onFundingError={app.reportFundingError}
        onFundingPendingChange={app.fundingPendingChange}
      />
    </main>
  );
}
