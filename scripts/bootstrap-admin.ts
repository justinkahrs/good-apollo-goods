import 'dotenv/config';
import { db } from '../src/server/db';
import { adminEmails } from '../src/server/config';
const emails = adminEmails();
await db().$transaction(
  emails.map((email) =>
    db().user.upsert({
      where: { email },
      create: {
        email,
        name: 'Good Apollo operator',
        emailVerified: false,
        role: 'admin',
      },
      update: { role: 'admin' },
    }),
  ),
);
console.log(
  `${emails.length} allowlisted operators are ready for email sign-in.`,
);
await db().$disconnect();
