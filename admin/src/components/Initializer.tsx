import { useEffect, useRef } from 'react';
import { PLUGIN_ID } from '../pluginId';

interface Props {
  setPlugin: (id: string) => void;
}

export const Initializer = ({ setPlugin }: Props) => {
  const ref = useRef(setPlugin);

  useEffect(() => {
    ref.current(PLUGIN_ID);
  }, []);

  return null;
};
