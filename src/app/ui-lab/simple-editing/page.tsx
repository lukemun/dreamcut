import { notFound } from "next/navigation";
import { SimpleEditingDemo } from "./simple-editing-demo";
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <SimpleEditingDemo />;
}
