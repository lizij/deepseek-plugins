// HTML 模板模块声明（由 tsup text loader 打包为字符串）
declare module '*.html' {
  const content: string;
  export default content;
}
