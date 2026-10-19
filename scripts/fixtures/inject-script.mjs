export function injectFixtureScript(html,source){
  if(html.split('</body>').length!==2)throw new Error('Fixture needs exactly one body anchor.');
  return html.replace('</body>',()=>'<script>'+source.replace(/<\/script/gi,'<\\/script')+'</script></body>');
}
