import type { Meta, StoryObj } from "@storybook/react";
import { BadgeCheck, Trash2, Wrench } from "lucide-react";
import {
  Modal,
  ModalBody,
  ModalButton,
  ModalFooter,
  ModalHeader,
} from "./Modal";

/**
 * The shared modal template. This is the proposed shell — dialogs adopt it one
 * by one where it fits (see the per-dialog stories for comparison). Buttons use
 * `ModalButton` so the hover / press feedback matches production.
 */
const meta = {
  title: "Maintenance/Modal (template)",
  component: Modal,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

const noop = () => {};

/** The reference header: plain title left, × close right. */
export const PlainTitle: Story = {
  args: { children: null, ariaLabel: "Run maintenance", onClose: () => {} },
  render: (args) => (
    <Modal {...args}>
      <ModalHeader title="Run maintenance" onClose={() => {}} />
      <ModalBody>
        Maintenance reviews the model in the background and reports proposals
        when the run finishes.
      </ModalBody>
    </Modal>
  ),
};

/** Icon + title header, explanation in the body, Cancel/Confirm. */
export const Confirm: Story = {
  args: { children: null, ariaLabel: "Run maintenance", onClose: () => {}, width: 480 },
  render: (args) => (
    <Modal {...args}>
      <ModalHeader icon={Wrench} title="Run maintenance?" />
      <ModalBody>
        This deletes 1 existing proposal, then runs a fresh maintenance pass.
      </ModalBody>
      <ModalFooter>
        <ModalButton onClick={noop}>Cancel</ModalButton>
        <ModalButton variant="primary" icon={Wrench} onClick={noop}>
          Delete &amp; run
        </ModalButton>
      </ModalFooter>
    </Modal>
  ),
};

/** Long, scrollable body with the header/footer pinned. */
export const WithScrollingBody: Story = {
  args: { children: null, ariaLabel: "Review", onClose: () => {}, width: 560 },
  render: (args) => (
    <Modal {...args}>
      <ModalHeader
        icon={BadgeCheck}
        title="Accept 3 confident proposals"
        onClose={() => {}}
      />
      <ModalBody>
        <div style={{ color: "#e5e7eb", marginBottom: 12 }}>
          Each cleared the Jev confidence bar of 90%. Lower-scoring proposals
          stay pending.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid #2d3034",
                background: "#1a1c1e",
              }}
            >
              Proposal {i + 1} — subsystem list click to graph load
            </div>
          ))}
        </div>
      </ModalBody>
      <ModalFooter>
        <ModalButton onClick={noop}>Cancel</ModalButton>
        <ModalButton variant="primary" icon={BadgeCheck} onClick={noop}>
          Accept 3
        </ModalButton>
      </ModalFooter>
    </Modal>
  ),
};

/** Destructive tone — icon tinted red, danger confirm. */
export const Danger: Story = {
  args: { children: null, ariaLabel: "Delete all proposals", onClose: () => {}, width: 480 },
  render: (args) => (
    <Modal {...args}>
      <ModalHeader icon={Trash2} tone="danger" title="Delete all 3 proposals" />
      <ModalBody>
        Deletes every pending proposal across all models. Accepted/rejected
        history is kept and model files are not changed.
      </ModalBody>
      <ModalFooter>
        <ModalButton onClick={noop}>Keep them</ModalButton>
        <ModalButton variant="danger" icon={Trash2} onClick={noop}>
          Delete all
        </ModalButton>
      </ModalFooter>
    </Modal>
  ),
};
