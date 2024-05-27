declare type DataSourceResult = DataSourceResultItem[];
declare type DataSourceResultItem = Item | ItemGroup;

declare type Item = {
  disabled?: boolean;
  label?: string;
  value: string;
};

declare type ItemGroup = {
  label?: string;
  children: Item[];
};

declare type DataSourcePayload = {
  event: string;
  items: DataSourceResult;
};
