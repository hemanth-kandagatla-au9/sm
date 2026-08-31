"use client";

import { useState } from "react";
import { CardShell } from "@/cards/CardShell";
import { DetailsModal } from "@/cards/DetailsModal";
import { Field, type FieldState } from "@/cards/Field";
import { Badge, OptionRow } from "@/cards/OptionRow";
import { Radio } from "@/cards/Radio";
import { SelectChip } from "@/cards/SelectChip";
import { FIXTURES } from "@/agent-ui/fixtures.generated";

/**
 * Every primitive in every designed state, on one page.
 *
 * A state that is only reachable by driving a real agent through a real graph
 * is a state nobody reviews. Error, missing and verified fields, a disabled
 * option row, an open modal — all of them are two seconds away here.
 */
const FIELD_STATES: ReadonlyArray<[FieldState, string]> = [
  ["default", "Resting."],
  ["error", "This Jira ID does not exist."],
  ["missing", "Expected, but not supplied."],
  ["verified", "Found in Jira."],
];

export function Primitives() {
  const [text, setText] = useState("PLATFORM-1423");
  const [dropdown, setDropdown] = useState("");
  const [chip, setChip] = useState("Q3 2026");
  const [picked, setPicked] = useState<string | null>(null);
  const [modal, setModal] = useState(false);

  /*
   * `reference_options` is optional in the contract, and indexing it yields
   * `OptionRow | undefined` under `noUncheckedIndexedAccess`. Both facts are
   * true of the live payload too — the agent may send neither — so the guard
   * below is the same one a real card has to write.
   */
  const optionFixture = FIXTURES.templateOrCrPicker.reference_options?.[0];

  return (
    <main className="mx-auto max-w-4xl px-8 py-12">
      <h1 className="font-display text-24 font-medium text-ink-900">Primitives</h1>
      <p className="mt-2 text-14 text-ink-500">
        The shared parts every card is assembled from, in each state the design
        defines. Geometry here is the design&rsquo;s: 55px field height, 24px
        horizontal padding, 16px radius.
      </p>

      <Block title="CardShell">
        <p className="mb-4 text-12 text-ink-500">
          The bottom-left corner is square — it is a speech bubble pointing at the
          avatar, which is bottom-aligned with the card, not top.
        </p>
        <CardShell meta={FIXTURES.crModeChoice.meta}>
          <h2 className="font-display text-20 font-medium text-ink-900">Card content</h2>
          <p className="text-16 text-ink-500">
            Cards pass their own content as children. They do not render their own
            avatar, border, padding or footer.
          </p>
        </CardShell>
      </Block>

      <Block title="Field — the nine states are five">
        <div className="grid gap-6 sm:grid-cols-2">
          {FIELD_STATES.map(([state, helper]) => (
            <Field
              key={state}
              id={`f-${state}`}
              label={`Jira ID (${state})`}
              required={state === "missing"}
              value={text}
              onChange={setText}
              state={state}
              helper={helper}
            />
          ))}
          <Field id="f-disabled" label="Platform (disabled)" value="SAP SolMan" disabled helper="Locked by compliance." />
          <Field
            id="f-dropdown"
            label="Target system (dropdown)"
            value={dropdown}
            onChange={setDropdown}
            placeholder="Select a target system"
            options={["ECP", "S/4HANA", "BW/4HANA"]}
            helper="A designed panel, not the OS list."
          />
        </div>
      </Block>

      <Block title="SelectChip">
        <div className="flex flex-wrap gap-2">
          {["Q1 2026", "Q2 2026", "Q3 2026", "Q4 2026"].map((label) => (
            <SelectChip
              key={label}
              label={label}
              selected={chip === label}
              onSelect={() => setChip(label)}
            />
          ))}
          <SelectChip label="Disabled" selected={false} disabled onSelect={() => {}} />
        </div>
      </Block>

      <Block title="Radio">
        <div className="flex items-center gap-8">
          {[
            ["unchecked", false, false],
            ["checked", true, false],
            ["disabled", false, true],
          ].map(([label, checked, disabled]) => (
            <span key={label as string} className="flex items-center gap-2 text-14 text-ink-600">
              <Radio checked={checked as boolean} disabled={disabled as boolean} />
              {label as string}
            </span>
          ))}
        </div>
      </Block>

      <Block title="OptionRow + Badge">
        <p className="mb-4 text-12 text-ink-500">
          Expanding and selecting are separate controls on purpose — reading the
          details of an option is not the same as choosing it.
        </p>
        {optionFixture ? (
          <div className="space-y-2">
            <OptionRow
              option={optionFixture}
              selected={picked === optionFixture.value}
              onSelect={() => setPicked(optionFixture.value)}
              onExpand={() => setModal(true)}
            />
            <OptionRow
              option={{ ...optionFixture, label: "A disabled option", value: "x", disabled: true }}
              selected={false}
              onSelect={() => {}}
              onExpand={() => {}}
            />
          </div>
        ) : (
          <p className="text-14 text-ink-500">
            The fixture carries no reference options.
          </p>
        )}
        <div className="mt-4">
          <Badge>Platform</Badge>
        </div>
      </Block>

      <Block title="DetailsModal">
        <button
          type="button"
          onClick={() => setModal(true)}
          className="rounded-md border border-line px-4 py-2 text-14 text-ink-800"
        >
          Open modal
        </button>
        {modal && optionFixture && (
          <DetailsModal
            title={optionFixture.label}
            details={optionFixture.details ?? []}
            onClose={() => setModal(false)}
          />
        )}
      </Block>
    </main>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12 border-t border-line pt-8">
      <h2 className="mb-4 font-display text-20 font-medium text-ink-900">{title}</h2>
      {children}
    </section>
  );
}
