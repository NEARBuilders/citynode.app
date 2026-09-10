import { Tabs, TabsList, TabsTrigger } from "@/components";
import {
  DEFAULT_PROPOSAL_REVIEW_FILTER,
  PROPOSAL_REVIEW_FILTERS,
  type ProposalReviewFilter,
} from "./-proposal-review";

export function ProposalReviewFilters({
  value,
  onChange,
}: {
  value: ProposalReviewFilter;
  onChange: (value: ProposalReviewFilter) => void;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(nextValue) => {
        if (PROPOSAL_REVIEW_FILTERS.includes(nextValue as ProposalReviewFilter)) {
          onChange(nextValue as ProposalReviewFilter);
        }
      }}
    >
      <TabsList className="justify-start overflow-x-auto">
        {PROPOSAL_REVIEW_FILTERS.map((filter) => (
          <TabsTrigger key={filter} value={filter} className="capitalize">
            {filter}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

export function normalizeProposalReviewFilter(value: ProposalReviewFilter) {
  return value === DEFAULT_PROPOSAL_REVIEW_FILTER ? undefined : value;
}
