import JournalRecord from '@/app/components/JournalRecord';
export default async function Page({params}:{params:Promise<{id:string}>}){const{id}=await params;return <JournalRecord id={id}/>;}
