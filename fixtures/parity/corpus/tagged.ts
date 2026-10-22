declare function css(strings: TemplateStringsArray): string;
declare function gql(strings: TemplateStringsArray): string;

export const style = css`
  .button{color:red;  margin:0}
`;

export const query = gql`
  query   Get { user(id:1){name   email} }
`;
