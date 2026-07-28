import { sectOrganizationFacade } from '.';
import { createPostgresSectConstructionContext } from './PostgresSectOrganizationAdapters';
import {
  executeSectPlayerCommand,
  type SectCommandArgs,
} from './commandSupport';

export function executeSectConstructionDonationCommand(
  args: SectCommandArgs & {
    demandId: string;
    itemId?: string;
    quantity: number;
  },
) {
  return executeSectPlayerCommand(args, (tx) =>
    sectOrganizationFacade.construction.donate(
      args.cultivatorId,
      {
        demandId: args.demandId,
        itemId: args.itemId,
        quantity: args.quantity,
      },
      createPostgresSectConstructionContext({
        q: tx,
        runtime: args.runtime,
      }),
    ),
  );
}
