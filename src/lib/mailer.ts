import { createTransport } from "nodemailer";

export default async function sendEmailNotification(title: string) {
  const transporter = createTransport({
    host: process.env.MAIL_HOST,
    port: 465,
    secure: true,
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASSWORD,
    },
  });

  const mailOptions = {
    from: process.env.FROM_MAIL,
    to: process.env.TO_MAIL,
    subject: `New treat added!`,
    text: `${title} is now on treats.`,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.log("Error sending mail!");
  }
}
