import fs from 'node:fs';
const root='src-tauri/gen/android/';
const wrapper=root+'gradle/wrapper/gradle-wrapper.properties';
let settings=fs.readFileSync(wrapper,'utf8');
if(!/^distributionUrl=/m.test(settings))throw Error('Generated Gradle wrapper has no distribution URL');
settings=settings.replace(/^distributionUrl=.*$/m,'distributionUrl=https\\://services.gradle.org/distributions/gradle-9.9.1-bin.zip').replace(/^distributionSha256Sum=.*\r?\n?/m,'');
settings+='\ndistributionSha256Sum=d8a18a7a841dd5df825d35a685fad6f2d7f12ac0c280e57b67c27b4a520ba228\n';
fs.writeFileSync(wrapper,settings);
const manifest=root+'app/src/main/AndroidManifest.xml';
let xml=fs.readFileSync(manifest,'utf8');
if(!xml.includes('<application'))throw Error('Missing Android application declaration');
for(const name of ['allowBackup','usesCleartextTraffic']){
  const attr=new RegExp(`android:${name}="[^"]*"`);
  xml=attr.test(xml)?xml.replace(attr,`android:${name}="false"`):xml.replace('<application',`<application android:${name}="false"`);
}
fs.writeFileSync(manifest,xml);
