import { SectManagedRoom, type SectManagedRoomProps } from './SectManagedRoom';
import { useSectRoomRouteSelection } from './useSectRoomRouteSelection';

export type SectRoutedRoomProps = Omit<SectManagedRoomProps, 'selection'>;

export function SectRoutedRoom(props: SectRoutedRoomProps) {
  const selection = useSectRoomRouteSelection(props.roomKey);
  return <SectManagedRoom {...props} selection={selection} />;
}
