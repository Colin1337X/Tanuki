import fs from 'node:fs';
const root='src-tauri/gen/android/';
const wrapper=root+'gradle/wrapper/gradle-wrapper.properties';
let settings=fs.readFileSync(wrapper,'utf8');
if(!/^distributionUrl=/m.test(settings))throw Error('Generated Gradle wrapper has no distribution URL');
settings=settings.replace(/^distributionUrl=.*$/m,'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.14.6-bin.zip').replace(/^distributionSha256Sum=.*\r?\n?/m,'');
settings+='\ndistributionSha256Sum=7988ed071b2a07900e2ec715fca15c6ab72bce6db433af301fa7fa7e9407bd24\n';
fs.writeFileSync(wrapper,settings);
const manifest=root+'app/src/main/AndroidManifest.xml';
let xml=fs.readFileSync(manifest,'utf8');
if(!xml.includes('<application'))throw Error('Missing Android application declaration');
for(const name of ['allowBackup','usesCleartextTraffic']){
  const attr=new RegExp(`android:${name}="[^"]*"`);
  xml=attr.test(xml)?xml.replace(attr,`android:${name}="false"`):xml.replace('<application',`<application android:${name}="false"`);
}
fs.writeFileSync(manifest,xml);
